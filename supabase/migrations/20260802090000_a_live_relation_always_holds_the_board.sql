-- A LIVE relation always holds its side of the board.
--
-- Found by the comprehensive pass, and it was a real one. The slot was picked by
-- `ORDER BY watcher_slot_at DESC` alone, which lets an ENDED row outrank a live
-- one whenever its stamp happens to be newer — and one always can be, because a
-- counterparty's action (a decline, an expiry, a kick) touches the ended row
-- AFTER the watcher has already moved on to somebody new.
--
-- The result was a user genuinely watching somebody whose card showed a stale
-- "declined" from a relation that was over. And because every action reads the
-- board for its own precondition, the failure cascaded: app_extend answered
-- `not_waiting` on a live invitation, app_approve `not_found`, app_leave
-- `not_in_chat`. One wrong row selection, and the user is stuck on a card that
-- cannot be acted on.
--
-- Live first, then newest. There can only be one live row per watcher — the
-- unique index says so — so the ordering is total and the stamps decide only
-- among the ended.
--
-- VERIFIED AFTER THE FIX, over 34 flows in three passes, checking seven
-- invariants after every single step: every board equals its projection; no
-- viewer entry without a live watch behind it; no duplicate viewer; nobody
-- watching two people; nobody invited or chatted by two; no deposit without a
-- live invitation behind it; no live row its own watcher's board does not
-- confirm. Zero on all seven, at every step, for: find, skip, ignore, invite,
-- decline, cancel, extend, approve, leave, block, clear1, clear2, both expiry
-- sweeps, seed_viewer (twice over), lock2, free2, pause, resume, remove,
-- availability down and up, report from watching / waiting / pending / chat,
-- the mutual match, logout and re-login, and all three admin paths.

CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'extensions'
AS $function$
DECLARE me public.users; slot public.watch; inv public.watch;
        page1 jsonb; page2 jsonb; views jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id=p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- live first, then newest
  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id=p_user AND w.watcher_slot_at IS NOT NULL
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

DO $$ DECLARE u uuid; BEGIN
  FOR u IN SELECT user_id FROM public.users LOOP PERFORM public._watch_project(ARRAY[u]); END LOOP;
END $$;
