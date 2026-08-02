-- The viewer list is in the order the watches began, and each watcher is in it
-- once.
--
-- app_find and app_seed_viewer APPEND to page2.profiles[], so the live array is
-- in start order — not user_id order, which is what the recompute and the
-- projection were both sorting by, and not the row's created_at either (that is
-- when the PAIR first related, which for a pair that has related before is the
-- old date). watcher_slot_at is when THIS watch started and moves every time the
-- watcher's board changes, so it is the append order.
--
-- Chasing that turned up something bigger, in the existing code rather than in
-- this model: driving four finds through app_find put the SAME watcher into a
-- target's list TWICE ("Tamar | Tamar"). The append has no de-duplication, so a
-- viewer can be counted more than once in "who is watching me" — the dock's
-- number and the visibility row's sentence both read that array's length. The
-- projection cannot produce it: one row per pair means one entry per watcher.
--
-- No duplicates exist in production today (there is one viewer entry in the
-- whole table), so this is a latent bug the current traffic level has not yet
-- surfaced — and one more thing that stops being possible once the list is
-- derived rather than appended to.

CREATE OR REPLACE FUNCTION public._watch_sync(p_watcher uuid, p_old_page1 jsonb, p_new_page1 jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  old_target uuid := NULLIF(p_old_page1->'profile'->>'user_id','')::uuid;
  new_target uuid := NULLIF(p_new_page1->'profile'->>'user_id','')::uuid;
  new_state  text := COALESCE(p_new_page1->>'state','free');
  mapped text; t uuid; fresh jsonb;
BEGIN
  mapped := CASE new_state WHEN 'watching' THEN 'watching' WHEN 'waiting' THEN 'invited'
                           WHEN 'chat' THEN 'chat' ELSE NULL END;

  IF old_target IS NOT NULL AND old_target IS DISTINCT FROM new_target THEN
    UPDATE public.watch SET state='ended', ended_at=COALESCE(ended_at,now()),
      watcher_reason=COALESCE(watcher_reason, NULLIF(p_new_page1->>'message','')), updated_at=now()
    WHERE watcher_id=p_watcher AND target_id=old_target AND state<>'ended';
  END IF;

  IF new_target IS NULL THEN
    UPDATE public.watch SET watcher_slot_at=NULL, updated_at=now()
    WHERE watcher_id=p_watcher AND watcher_slot_at IS NOT NULL;
  ELSE
    INSERT INTO public.watch (
      watcher_id, target_id, state, invited_at, expires_at, extended,
      ended_at, watcher_reason, watcher_cleared_at, watcher_slot_at, target_slot_at, target_profile_last)
    VALUES (p_watcher, new_target, COALESCE(mapped,'ended'),
      NULLIF(p_new_page1->>'invited_at','')::timestamptz,
      NULLIF(p_new_page1->>'expires_at','')::timestamptz,
      COALESCE((p_new_page1->>'extended')::boolean,false),
      CASE WHEN mapped IS NULL THEN now() END,
      CASE WHEN mapped IS NULL THEN NULLIF(p_new_page1->>'message','') END,
      CASE WHEN mapped IS NULL AND NULLIF(p_new_page1->>'message','') IS NULL THEN now() END,
      now(), CASE WHEN mapped IS NOT NULL THEN now() END, p_new_page1->'profile')
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state=EXCLUDED.state, invited_at=EXCLUDED.invited_at, expires_at=EXCLUDED.expires_at,
      extended=EXCLUDED.extended,
      ended_at=CASE WHEN EXCLUDED.state='ended' THEN COALESCE(public.watch.ended_at,now()) END,
      watcher_reason=CASE WHEN EXCLUDED.state='ended' THEN EXCLUDED.watcher_reason
                          ELSE public.watch.watcher_reason END,
      target_reason=public.watch.target_reason,
      watcher_cleared_at=EXCLUDED.watcher_cleared_at,
      watcher_slot_at=now(),
      target_slot_at=CASE WHEN EXCLUDED.state<>'ended' THEN now() ELSE public.watch.target_slot_at END,
      target_profile_last=COALESCE(EXCLUDED.target_profile_last, public.watch.target_profile_last),
      updated_at=now();
  END IF;

  FOREACH t IN ARRAY ARRAY[old_target, new_target] LOOP
    CONTINUE WHEN t IS NULL;
    SELECT COALESCE((
      SELECT jsonb_agg(public._watch_profile(v.user_id, t, false, true, null)
                       ORDER BY w.watcher_slot_at, v.user_id)
      FROM public.users v
      JOIN public.watch w ON w.watcher_id = v.user_id AND w.target_id = t
      WHERE v.relations->'page1'->>'state' = 'watching'
        AND (v.relations->'page1'->'profile'->>'user_id')::uuid = t
    ), '[]'::jsonb) INTO fresh;
    UPDATE public.users SET relations = jsonb_set(relations,'{page2,profiles}', fresh)
    WHERE user_id=t AND relations->'page2'->>'state'='free'
      AND relations->'page2'->'profiles' IS DISTINCT FROM fresh;
  END LOOP;
END;
$function$;

-- the projection reads it the same way (the ORDER BY is the only change here;
-- the rest of _watch_pages is unchanged from 20260802014359)
CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'extensions'
AS $function$
DECLARE me public.users; slot public.watch; inv public.watch;
        page1 jsonb; page2 jsonb; views jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id=p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id=p_user AND w.watcher_slot_at IS NOT NULL
  ORDER BY w.watcher_slot_at DESC LIMIT 1;

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
