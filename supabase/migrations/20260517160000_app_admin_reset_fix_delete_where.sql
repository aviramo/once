-- Fix: app_admin_reset() tripped Supabase's safeupdate guard
-- ("DELETE requires a WHERE clause") on `delete from public.restrictions;`.
-- The original edge handler used `.not("id","is",null)` precisely as a
-- dummy WHERE to satisfy that guard; restore an explicit (always-true,
-- since `id` is the never-null PK) predicate so the whole table still
-- clears. The other DELETEs/UPDATE already carry a WHERE.
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
  delete from public.restrictions where id is not null;

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
