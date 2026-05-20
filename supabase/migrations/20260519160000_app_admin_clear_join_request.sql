-- Admin: clear a user's join request (relations.join_request) and recompute
-- their availability so availability.join_requested flips off live (Realtime).
--
-- Used two ways from the web admin:
--   (1) explicit "remove request" button on the user-detail page — the user
--       stays gated (not in any enabled group) so user_availability returns
--       {state:'unavailable', reason:'group'} WITHOUT join_requested; the app's
--       centerNotice reverts to the "request to join" CTA (pre-request state).
--   (2) auto-cleanup when an admin assigns the user to a group — the request
--       is resolved; if the group is enabled the same recompute yields
--       {state:'available'} and the resync push fires.
--
-- Supersedes the prior "the join_request key is intentionally not cleared on
-- approval" behaviour (user request 2026-05-19).
--
-- Idempotent: `relations - 'join_request'` is a no-op when the key is absent.
-- Admin/service-role only (EXECUTE revoked), same pattern as app_admin_reset.
-- Additive / NOT breaking: brand-new RPC, mobile never calls it.
CREATE OR REPLACE FUNCTION public.app_admin_clear_join_request(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_loc extensions.geography;
  v_rel jsonb;
begin
  select location, relations
    into v_loc, v_rel
  from public.users
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  v_rel := v_rel - 'join_request';
  v_rel := jsonb_set(
    v_rel,
    '{availability}',
    public.user_availability(p_user_id, v_loc),
    true
  );

  update public.users
     set relations = v_rel
   where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'state', v_rel->'availability'->>'state'
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.app_admin_clear_join_request(uuid) FROM anon, authenticated;
