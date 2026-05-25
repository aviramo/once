-- 2026-05-25 — user request: delete the "חדשים" group and unassign every
-- member from it. The group was the auto-join target before the trigger
-- was dropped earlier today; it is no longer doing any work. Under the
-- new no-group=available rule, an affected user who held only "חדשים"
-- becomes a no-group user and stays available.
--
-- Order matters: user_groups.group_id has ON DELETE RESTRICT, so the
-- memberships must be dropped first. group_managers rows would cascade
-- via FK but the group has none at deploy time; if any are added before
-- this migration runs they cascade-delete automatically too.

DELETE FROM public.user_groups
 WHERE group_id IN (SELECT id FROM public.groups WHERE name = 'חדשים');

DELETE FROM public.groups WHERE name = 'חדשים';

-- Recompute availability for every user under the new gate. Idempotent:
-- a no-group user's availability stays `available`, so it is a no-op except
-- where the cached blob lagged behind. WHERE guards the safeupdate trigger.
UPDATE public.users u
   SET relations = jsonb_set(
         u.relations,
         '{availability}',
         public.user_availability(u.user_id, u.location)
       )
 WHERE user_id IS NOT NULL;
