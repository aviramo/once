-- app_admin_clear_join_request must NOT flip availability state.
--
-- Bug: setUserRoleAssignment (web) does upsert(user_groups) ->
-- app_admin_clear_join_request -> triggerResync(). The RPC used to recompute
-- relations.availability via user_availability() and persist it, so on a
-- group-assign it pre-flipped the user to {state:'available'}. The ONLY thing
-- that fires the area-open push is app_area_resync, and it queues that push
-- solely when relations.availability.state actually CHANGES. Because this RPC
-- already moved the state to 'available', the subsequent resync saw no diff
-- and never queued area-open: the user's app flipped via Realtime (if open)
-- but a user who was NOT in the app got no notification at all — exactly the
-- case the push exists for.
--
-- Fix: this function now only drops the pending-request key and the now-stale
-- 'join_requested' sub-field of the existing availability blob (so the mobile
-- gate UI clears the "request sent" indicator immediately). It never touches
-- the availability STATE. State transitions and their area-open/area-closed
-- pushes are owned solely by app_area_resync, so the transition stays
-- detectable: triggerResync() fires it immediately, and even if that edge
-- call fails the per-minute cron resync still catches it within ~60s.
--
-- "Remove request" (clearJoinRequest, user stays gated) is unchanged in
-- outcome: a still-gated user keeps {state:'unavailable',reason:'group'} with
-- 'join_requested' stripped — identical to the old recompute result.
CREATE OR REPLACE FUNCTION public.app_admin_clear_join_request(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rel jsonb;
begin
  select relations into v_rel
  from public.users
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  v_rel := v_rel - 'join_request';
  if v_rel ? 'availability' then
    v_rel := jsonb_set(
      v_rel, '{availability}',
      (v_rel->'availability') - 'join_requested', true);
  end if;

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
