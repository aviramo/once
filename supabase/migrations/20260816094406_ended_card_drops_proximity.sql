-- AN INVITATION THAT IS OVER STOPS SAYING WHERE THAT PERSON IS AND WHEN THEY
-- WERE LAST ABOUT (user directive 2026-08-16).
--
-- The proximity chip is live presence: it answers "how far away is this person
-- and when were they about" while the game still has the two of them in front
-- of each other. The moment a relation ENDS — an invitation that expired, was
-- declined, cancelled, ignored, a chat that was left — the card stays on the
-- screen as a record of what happened, and a record may not go on reporting a
-- stranger's live distance and last-seen. `_watch_profile` was stripping
-- `distance` for a CHAT only; every ended card kept both halves and both were
-- re-read from the `users` row on every projection, so the chip on a card that
-- was over went on ticking.
--
-- `p_ended` was already on the signature, carried unused "for the day the
-- projection becomes the refresh". That day is today: `_watch_pages` states it
-- for the two boards that are a record — page1's ended slot and page2's locked
-- message — and the profile drops distance AND last_seen together, which is
-- what makes the published client draw no chip at all (formatProximity returns
-- an empty phrase with neither half, and the chip is dropped on it).
--
-- A LIVE invitation is untouched: page2 'pending' and page1 'waiting' still
-- carry the chip, and so does a watching card. Only what is over goes quiet.

CREATE OR REPLACE FUNCTION public._watch_profile(p_of uuid, p_viewer uuid, p_chat boolean, p_listed boolean, p_last jsonb DEFAULT NULL::jsonb, p_ended boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  subject public.users; viewer public.users; dist int; prof jsonb;
BEGIN
  SELECT * INTO subject FROM public.users WHERE user_id = p_of;
  -- The stored snapshot is the fallback for a row that is gone, and it was
  -- written while the relation was live, so it carries the pair too.
  IF NOT FOUND THEN
    RETURN CASE WHEN p_ended THEN p_last - 'distance' - 'last_seen' ELSE p_last END;
  END IF;
  SELECT * INTO viewer FROM public.users WHERE user_id = p_viewer;

  dist := CASE
    WHEN viewer.location IS NULL OR subject.location IS NULL THEN NULL
    ELSE extensions.st_distance(viewer.location::extensions.geography,
                                subject.location::extensions.geography)::int END;

  prof := CASE WHEN p_listed THEN public.make_profile(subject, dist)
               ELSE public.make_profile(subject, dist, p_viewer) END;

  -- A chat drops the distance only: the two of them are talking, and when the
  -- other side was last about is part of that conversation.
  IF p_chat THEN prof := prof - 'distance'; END IF;
  -- A card that is OVER drops the whole chip.
  IF p_ended THEN prof := prof - 'distance' - 'last_seen'; END IF;
  RETURN prof;
END;
$function$;

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
      'profile', public._watch_profile(slot.target_id, p_user, slot.state='chat', false,
                                       slot.target_profile_last, slot.state='ended'));
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
      'profile', public._watch_profile(slot.watcher_id, p_user, false, false,
                                       slot.watcher_profile_last, true),
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
