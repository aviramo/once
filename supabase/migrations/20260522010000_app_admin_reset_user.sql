-- Single-user admin reset. The web admin user-detail page exposes a "reset
-- user" control alongside "delete user"; this is the per-user counterpart of
-- app_admin_reset(uuid[]) (the role/group-scoped reset). It wipes the user's
-- chat/log/restrictions and rebuilds relations to a clean slate WHILE
-- recomputing relations.availability via user_availability (so the gate stays
-- correct) and credits via _credits_reset_to_cap (tier preserved, balance to
-- the tier cap) -- identical semantics to the scoped reset, bounded to one row.
-- Like app_admin_reset it does NOT tear down non-reset partners' live links;
-- the user still exists so their partners' snapshots stay fresh via
-- app_refresh_snapshots (delete, by contrast, must tear partners down).
-- SECURITY DEFINER + EXECUTE revoked from anon/authenticated -- admin/
-- service-role only, same pattern as app_admin_reset / app_admin_clear_join_request.
CREATE OR REPLACE FUNCTION public.app_admin_reset_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_users int;
begin
  delete from public.chat
   where user_id = p_user_id or other_id = p_user_id;

  delete from public.log
   where user_id = p_user_id;

  delete from public.restrictions
   where user_id = p_user_id or other_id = p_user_id;

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location),
      'credits', public._credits_reset_to_cap(u.relations)
    )
  where u.user_id = p_user_id;
  get diagnostics v_users = row_count;

  return jsonb_build_object('ok', v_users > 0, 'users', v_users);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.app_admin_reset_user(uuid) FROM anon, authenticated;
