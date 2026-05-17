-- Role-scoped admin reset (overload).
--
-- The web admin "reset users" control now opens a role checklist; only users
-- who hold AT LEAST ONE of the selected roles are reset. This is the scoped
-- sibling of the existing no-arg public.app_admin_reset() (kept as-is, unused
-- by the web flow but available as the global path). Postgres resolves the two
-- by arity; PostgREST resolves by the presence of the `p_role_ids` argument.
--
-- Scope of a reset for the targeted users (mirrors the global reset, but every
-- statement is bounded to the target set — never the whole table, so the
-- Supabase safeupdate guard is satisfied by a real WHERE, not a dummy one):
--   * delete their chat (as sender OR recipient)
--   * delete their log rows
--   * delete restrictions they issued OR received
--   * rebuild relations (page1 locked / page2 free) and recompute
--     availability via user_availability(user_id, location) so the geo +
--     role-disable gate stays correct immediately after the reset
--
-- Empty / null array => no-op (returns {users:0}); it must NEVER fall through
-- to "reset everyone".
create or replace function public.app_admin_reset(p_role_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  if p_role_ids is null or array_length(p_role_ids, 1) is null then
    return jsonb_build_object('users', 0);
  end if;

  delete from public.chat
   where user_id in (select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids))
      or other_id in (select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids));

  delete from public.log
   where user_id in (select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids));

  delete from public.restrictions
   where user_id in (select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids))
      or other_id in (select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids));

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location)
    )
  where u.user_id in (
    select ur.user_id from public.user_roles ur where ur.role_id = any(p_role_ids)
  );
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset(uuid[]) from public, anon, authenticated;
