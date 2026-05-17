-- Admin global reset, moved server-side into one atomic RPC.
--
-- Before: the edge `app/reset` handler did the reset as a bulk PostgREST
-- `users` UPDATE that overwrote `relations` with a hard-coded literal
-- ({page1:locked, page2:free}). That literal had no `availability` key, so
-- every user's geo-gate state (relations.availability) was destroyed by a
-- reset. Until that user's next start/location/focus recomputed it, the
-- default-DENY gate left located users wrongly `unavailable` even where an
-- area actively covers them — i.e. reset broke the per-user availability.
--
-- Fix: do the whole reset in SQL and recompute availability per row from the
-- user's current location + the current areas, exactly as app_availability
-- (= area_state(me.location)) would. After a reset the geo-gate is correct
-- immediately (Realtime carries it to open apps), not wiped.
--
-- This RPC is the single entry point for the admin "reset users" action,
-- now triggered from the web admin (service role) instead of the mobile app.
-- chat/log delete predicates mirror the previous handler exactly (log keeps
-- its null-user rows; restrictions are cleared wholesale).
create or replace function public.app_admin_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  delete from public.chat where user_id is not null;
  delete from public.log where user_id is not null;
  delete from public.restrictions;

  update public.users set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.area_state(location)
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset() from public, anon, authenticated;
