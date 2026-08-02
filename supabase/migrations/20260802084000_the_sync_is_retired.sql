-- The last writers come over, and the sync is retired.
--
-- CONSOLIDATED (the admin releases, the availability pair, delete cleanup, the
-- broadcast, the refresh replacement, and the retirement itself).
--
-- After this there is ONE direction and ONE writer: an RPC states what happened
-- between two people, and both boards are drawn from that row. Verified by
-- asking the database itself — no function in `public` writes relations.page1 or
-- relations.page2 except _watch_project, and the app cannot write the users
-- table at all (SELECT only, in both the grants and the policies).
--
-- WHAT THIS RETIRES, AND WHY EACH HAD NO JOB LEFT
--   users_watch_sync / _watch_sync / _watch_sync_target / _watch_sync_tg
--       existed to READ a board somebody had authored and record it as a
--       relation. Every writer states the relation directly now.
--   _remove_from_profiles
--       "take me out of their array". Zero callers: ending a relation removes
--       both ends of it, because there is only one end.
--   app_refresh_snapshots
--       replaced by app_refresh_boards, which is the projection. Refreshing a
--       snapshot IS projecting a board — same source, same make_profile — but
--       the projection only runs on a CHANGE and a snapshot goes stale on the
--       clock, so the call site stays and what it calls changed. The edge
--       function was deployed with the swap before this ran.
--
-- WHAT THAT MAKES IMPOSSIBLE RATHER THAN FIXED. Every bug found on the way here
-- was the same shape — two copies of one fact, maintained by hand:
--   * a real user's whole profile stranded in another real user's viewer list
--     for three weeks (_expire_watch_one's conditional detach)
--   * the same watcher counted twice on one card (app_find's un-checked append)
--   * a matched pair left findable, visible and invitable for the whole chat
--   * availability, push and communities dropped on every match and every
--     logout (app_approve's and app_logout_cleanup's wholesale rebuild)
--   * an invitee marked hidden forever by merely receiving an invitation
--   * a returning user left hidden because his logout marker had been erased
-- None of them can be expressed any more.
--
-- app_area_resync needed no conversion: it only calls _apply_availability.

CREATE OR REPLACE FUNCTION public.app_refresh_boards(me_id uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT x), '{}'::uuid[]) INTO ids
  FROM (SELECT w.watcher_id x FROM public.watch w
         WHERE w.state <> 'ended' AND (w.watcher_id = me_id OR w.target_id = me_id)
        UNION SELECT w.target_id FROM public.watch w
         WHERE w.state <> 'ended' AND (w.watcher_id = me_id OR w.target_id = me_id)
        UNION SELECT w.watcher_id FROM public.watch w
         WHERE w.target_id = me_id AND w.target_slot_at IS NOT NULL
        UNION SELECT w.target_id FROM public.watch w
         WHERE w.watcher_id = me_id AND w.watcher_slot_at IS NOT NULL) q;
  PERFORM public._watch_project(ARRAY[me_id] || ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.app_refresh_boards(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_refresh_boards(uuid) TO service_role;

-- ── the retirement ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS users_watch_sync ON public.users;
DROP FUNCTION IF EXISTS public._watch_sync_tg();
DROP FUNCTION IF EXISTS public._watch_sync(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public._watch_sync_target(uuid, jsonb);
DROP FUNCTION IF EXISTS public._remove_from_profiles(uuid, uuid);
DROP FUNCTION IF EXISTS public.app_refresh_snapshots(uuid);
