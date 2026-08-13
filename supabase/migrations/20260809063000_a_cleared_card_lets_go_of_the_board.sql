-- A CLEARED CARD LETS GO OF THE BOARD, AND A LAPSED WATCH EXCLUDES NOBODY
--
-- Two bugs, reported as one: the play button was pressed, the radar ran for
-- twenty-one seconds (the client's watchdog) and the button came back as play.
-- The magnifying glass -- "nobody nearby", the one thing that state is for --
-- was unreachable.
--
-- 1. THE GHOST SLOT. `app_clear1` stamps `watcher_cleared_at` on the ended row
--    and leaves `watcher_slot_at` where it is; `_watch_pages` picked page1's
--    slot by `watcher_slot_at IS NOT NULL` alone, so a card the user dismissed
--    days ago went on BEING page1 forever: `locked` + the dead profile + no
--    message. And the branch that produces `'free'` is only reached when NO
--    slot row is found, so page1 could never leave `locked` again -- which is
--    also why `app_find`'s `SET seeking = true` looked like dead code: the
--    projection never asked. page2 has never had this problem, because its own
--    slot query already filters `target_cleared_at IS NULL`; page1's simply
--    did not. This is that filter, on the side that was missing it. An ended
--    row that has been read is not on the board.
--
-- 2. A LAPSED WATCH THAT STILL EXCLUDES. `app_find` drops any candidate who is
--    watching or inviting ME -- rightly, that person is already looking at my
--    card -- but it asked only for the STATE, never for the clock. The watch
--    sweep is HOURLY (`0 * * * *`), so a watch that expires at 06:00:42 is a
--    live exclusion until 07:00, and for that hour everyone who happened to
--    look at me is filtered out of my own draw. Measured on a real account:
--    one candidate in range, excluded by a watch that had run out thirteen
--    minutes earlier, five finds in a row answered with nothing. app_find
--    already asks the clock about my OWN watching row (`v_lapsed`) and about an
--    invitation aimed at me; this is the same question asked of the exclusion.
--    Nothing is expired here -- the sweep still owns that -- a relation whose
--    clock has run out simply stops speaking for the person it belonged to.

-- ── _watch_pages: a cleared ended row is off the board ─────────────────────
CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE me public.users; slot public.watch; inv public.watch;
        page1 jsonb; page2 jsonb; views jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id=p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- A live row always holds the board. An ENDED row holds it only until it has
  -- been read: `watcher_cleared_at` is app_clear1's stamp, and it is the same
  -- test page2's slot query below has always made with `target_cleared_at`.
  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id=p_user AND w.watcher_slot_at IS NOT NULL
    AND (w.state <> 'ended' OR w.watcher_cleared_at IS NULL)
  ORDER BY (w.state <> 'ended') DESC, w.watcher_slot_at DESC LIMIT 1;

  IF NOT FOUND THEN
    page1 := jsonb_build_object('state', CASE WHEN me.seeking THEN 'free' ELSE 'locked' END);
  ELSE
    page1 := jsonb_build_object(
      'state', CASE slot.state WHEN 'invited' THEN 'waiting' WHEN 'ended' THEN 'locked' ELSE slot.state END,
      'profile', public._watch_profile(slot.target_id, p_user, slot.state='chat', false, slot.target_profile_last));
    IF slot.state='watching' AND slot.expires_at IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('expires_at', slot.expires_at);
    ELSIF slot.state='invited' THEN
      page1 := page1
        || CASE WHEN slot.invited_at IS NOT NULL THEN jsonb_build_object('invited_at',slot.invited_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.expires_at IS NOT NULL THEN jsonb_build_object('expires_at',slot.expires_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.extended THEN jsonb_build_object('extended',true) ELSE '{}'::jsonb END;
    ELSIF slot.state='ended' AND slot.watcher_cleared_at IS NULL AND slot.watcher_reason IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('message', slot.watcher_reason);
    END IF;
  END IF;

  SELECT * INTO inv FROM public.watch w
  WHERE w.target_id=p_user AND w.state IN ('invited','chat') LIMIT 1;

  IF FOUND AND inv.state='invited' THEN
    page2 := jsonb_build_object('state','pending',
      'profile', public._watch_profile(inv.watcher_id, p_user, false, false, inv.watcher_profile_last))
      || CASE WHEN inv.invited_at IS NOT NULL THEN jsonb_build_object('invited_at',inv.invited_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.expires_at IS NOT NULL THEN jsonb_build_object('expires_at',inv.expires_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.extended THEN jsonb_build_object('extended',true) ELSE '{}'::jsonb END;
    RETURN jsonb_build_object('page1',page1,'page2',page2);
  ELSIF FOUND THEN
    RETURN jsonb_build_object('page1',page1,'page2',jsonb_build_object('state','locked'));
  END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.target_id=p_user AND w.target_slot_at IS NOT NULL
    AND w.target_cleared_at IS NULL AND w.target_reason IS NOT NULL
  ORDER BY w.target_slot_at DESC LIMIT 1;

  IF FOUND THEN
    page2 := jsonb_build_object('state','locked','message',slot.target_reason,
      'profile', public._watch_profile(slot.watcher_id, p_user, false, false, slot.watcher_profile_last),
      'profiles','[]'::jsonb);
  ELSIF NOT me.discoverable THEN
    page2 := jsonb_build_object('state','locked');
  ELSE
    SELECT COALESCE(jsonb_agg(public._watch_profile(w.watcher_id, p_user, false, true, w.watcher_profile_last)
                              ORDER BY w.watcher_slot_at, w.watcher_id), '[]'::jsonb) INTO views
    FROM public.watch w
    WHERE w.target_id=p_user AND w.state='watching'
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=w.watcher_id);
    page2 := jsonb_build_object('state','free','profiles',views);
  END IF;

  RETURN jsonb_build_object('page1',page1,'page2',page2);
END;
$function$;

-- ── app_find: a relation whose clock has run out excludes nobody ───────────
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row      public.users;
  v_old       uuid;
  v_excl      uuid;
  v_inviter   uuid;
  picked_id   uuid;
  picked_dist int;
  picked_row  public.users;
  result_user json;
  cand_ids    uuid[];
  cand_dists  int[];
  la_row      public.users;
  lookahead   jsonb := '[]'::jsonb;
  i           int;
  v_lapsed    boolean;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  -- An invitation aimed at me whose clock has run out is settled a few lines
  -- down; it may not also keep its sender out of my draw in the meantime.
  SELECT w.watcher_id INTO v_inviter FROM public.watch w
  WHERE w.target_id = me_id AND w.state = 'invited'
    AND (w.expires_at IS NULL OR w.expires_at > now());

  SELECT w.target_id, (w.expires_at IS NULL OR w.expires_at <= now())
  INTO v_excl, v_lapsed
  FROM public.watch w WHERE w.watcher_id = me_id AND w.state = 'watching';
  IF COALESCE(v_lapsed, false) THEN v_excl := NULL; END IF;

  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND (v_excl IS NULL OR o.user_id <> v_excl)
      AND (v_inviter IS NULL OR o.user_id <> v_inviter)
      -- Someone already looking at my card is not drawn to me a second time --
      -- but only while that relation is actually alive. The watch sweep is
      -- hourly, so a `watching` row that ran out at 06:00 is a corpse until
      -- 07:00, and asking the state alone let it empty my draw for the hour.
      AND NOT EXISTS (SELECT 1 FROM public.watch w
                      WHERE w.watcher_id = o.user_id AND w.target_id = me_id
                        AND w.state IN ('watching','invited')
                        AND (w.expires_at IS NULL OR w.expires_at > now()))
  ) c
  WHERE c.rn <= 3;

  picked_id   := cand_ids[1];
  picked_dist := cand_dists[1];

  SELECT w.target_id INTO v_old FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state = 'watching';

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, v_old, picked_id]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- a pending invitation whose clock has run out lands as an expiry first
  UPDATE public.watch w SET state='ended', ended_at=now(),
    target_reason='expire', target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
  WHERE w.target_id = me_id AND w.state='invited' AND w.expires_at <= now();

  -- only from an empty or watching board, as before
  IF EXISTS (SELECT 1 FROM public.watch w
             WHERE w.watcher_id = me_id AND w.state IN ('invited','chat')) THEN
    PERFORM public._watch_project(ARRAY[me_id]);
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb, 'lookahead','[]'::jsonb);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF NOT picked_row.discoverable
       OR EXISTS (SELECT 1 FROM public.watch w
                  WHERE w.target_id = picked_id AND w.state IN ('invited','chat'))
       OR EXISTS (SELECT 1 FROM public.watch w
                  WHERE w.watcher_id = picked_id AND w.state = 'chat') THEN
      picked_id := NULL;
    END IF;
  END IF;

  -- whatever was on my card comes off
  UPDATE public.watch w SET state='ended', ended_at=now(),
    watcher_reason=NULL, watcher_slot_at=NULL, updated_at=now()
  WHERE w.watcher_id = me_id AND w.state = 'watching';

  IF picked_id IS NULL THEN
    UPDATE public.users SET seeking = true WHERE user_id = me_id AND NOT seeking;
  ELSE
    INSERT INTO public.watch (watcher_id, target_id, state, expires_at, watcher_slot_at, target_slot_at)
    VALUES (me_id, picked_id, 'watching', now() + public._watch_ttl(), now(), now())
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state='watching', expires_at=now() + public._watch_ttl(),
      ended_at=NULL, watcher_reason=NULL, watcher_cleared_at=NULL,
      invited_at=NULL, extended=false,
      watcher_slot_at=now(), target_slot_at=now(), updated_at=now();
  END IF;

  PERFORM public._watch_project(ARRAY[me_id, v_old, picked_id]);

  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids,1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead := lookahead || jsonb_build_array(public.make_profile(la_row, cand_dists[i], me_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb, 'lookahead', lookahead);
END;
$function$;

-- ── The boards already holding a ghost ─────────────────────────────────────
-- Eight accounts are sitting on a card they dismissed (three of them real
-- users): page1 `locked`, a profile from days ago, no message, and a play
-- button that answers with nothing. The projection is what decides a board, so
-- re-running it over exactly those users is the whole repair -- no board is
-- hand-written here.
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN
    SELECT DISTINCT w.watcher_id FROM public.watch w
    WHERE w.state = 'ended' AND w.watcher_slot_at IS NOT NULL
      AND w.watcher_cleared_at IS NOT NULL
  LOOP
    PERFORM public._watch_project(ARRAY[u]);
  END LOOP;
END $$;
