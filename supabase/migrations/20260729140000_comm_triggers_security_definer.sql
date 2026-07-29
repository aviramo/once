-- Admin-panel "delete account" was failing with
--   ERROR: permission denied for table users (SQLSTATE 42501)
-- raised by GoTrue's DELETE /admin/users.
--
-- Why: the panel deletes the AUTH user, so the statement runs as
-- `supabase_auth_admin` (not service_role). auth.users -> public.users is ON
-- DELETE CASCADE, and public.users cascades on to user_groups / friend_links /
-- friend_requests / group_join_requests / group_managers. Each of those carries
-- a `comm_*` AFTER DELETE trigger that recomputes the denormalized communities
-- summary via _refresh_communities(), i.e. an UPDATE on public.users.
--
-- The RI cascade itself runs with the referencing table's owner privileges, but
-- a trigger function fires as the CURRENT role. These were invoker-rights, so
-- the summary refresh (and the direct groups/group_managers/user_groups reads
-- in two of them) ran as supabase_auth_admin, which has no grants in public.
-- Any user who belonged to a group or had a friend link could therefore never
-- be deleted from the admin panel.
--
-- Fix: the communities-summary maintenance path becomes SECURITY DEFINER
-- (owner = postgres), so it no longer depends on who triggered the cascade.
-- Bodies are untouched; only the security attribute changes. search_path is
-- already pinned on all of them except _users_keep_communities, which gets it
-- here (mandatory for a definer function).

ALTER FUNCTION public._refresh_communities(uuid)  SECURITY DEFINER;
ALTER FUNCTION public._communities_summary(uuid)  SECURITY DEFINER;

ALTER FUNCTION public._trg_comm_membership()      SECURITY DEFINER;
ALTER FUNCTION public._trg_comm_friend_link()     SECURITY DEFINER;
ALTER FUNCTION public._trg_comm_friend_req()      SECURITY DEFINER;
ALTER FUNCTION public._trg_comm_join_req()        SECURITY DEFINER;
ALTER FUNCTION public._trg_comm_group()           SECURITY DEFINER;

ALTER FUNCTION public._users_keep_communities()   SECURITY DEFINER
  SET search_path = public, extensions;

-- Definer functions are published by PostgREST like any other, so the two that
-- are callable with arguments are closed to the client roles. The trigger
-- functions take no arguments and error out unless fired by a trigger, so their
-- default grants are harmless (and a runtime EXECUTE check on a trigger
-- function would break the very cascade this migration repairs).
REVOKE EXECUTE ON FUNCTION public._refresh_communities(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._communities_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._refresh_communities(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public._communities_summary(uuid) TO service_role;
