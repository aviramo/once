-- Approve-all for a group's join queue (one RPC, one transaction).
--
-- The admit-everyone-waiting logic already existed as _group_drain_requests,
-- written for the "group turned OPEN" flip, where clearing the DECLINED
-- tombstones too is right: nobody is refused a group that no longer refuses
-- anyone. Approving the queue by hand leaves the group approval-gated, so the
-- tombstones must survive -- hence the one flag, rather than a second copy of
-- the same INSERT/notify/availability block.
DROP FUNCTION IF EXISTS public._group_drain_requests(uuid);

CREATE OR REPLACE FUNCTION public._group_drain_requests(p_group_id uuid, p_pending_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_name text; v_test boolean; v_notify jsonb;
BEGIN
  SELECT g.name, g.is_test INTO v_name, v_test FROM public.groups g WHERE g.id = p_group_id;
  INSERT INTO public.user_groups(user_id, group_id)
    SELECT jr.user_id, jr.group_id
      FROM public.group_join_requests jr
     WHERE jr.group_id = p_group_id AND jr.status = 'pending'
       AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test
    ON CONFLICT (user_id, group_id) DO NOTHING;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', jr.user_id, 'code', 'group_approved',
           'group_id', p_group_id, 'group_name', v_name)), '[]'::jsonb)
    INTO v_notify
    FROM public.group_join_requests jr
   WHERE jr.group_id = p_group_id AND jr.status = 'pending'
     AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test;
  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{availability}', public.user_availability(u.user_id, u.location))
   WHERE u.user_id IN (SELECT jr.user_id FROM public.group_join_requests jr
                        WHERE jr.group_id = p_group_id AND jr.status = 'pending');
  DELETE FROM public.group_join_requests
   WHERE group_id = p_group_id
     AND (NOT p_pending_only OR status = 'pending');
  RETURN v_notify;
END; $function$;

-- Owner/manager empties the whole queue in one go: every pending request for
-- the group is approved, each requester pushed, and the fresh queue + roster
-- come back in the same shape app_respond_join returns, so the client's caches
-- are written from one answer.
CREATE OR REPLACE FUNCTION public.app_approve_all_joins(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_notify jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL AND NOT EXISTS(SELECT 1 FROM public.groups WHERE id = p_group_id) THEN
    RETURN jsonb_build_object('error', 'no_group');
  END IF;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;

  v_notify := public._group_drain_requests(p_group_id, true);

  RETURN jsonb_build_object(
    'notify',   v_notify,
    'requests', (public.app_group_requests(me_id, p_group_id))->'requests',
    'members',  (public.app_group_members(me_id, p_group_id))->'members'
  );
END; $function$;

REVOKE ALL ON FUNCTION public.app_approve_all_joins(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_approve_all_joins(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public._group_drain_requests(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._group_drain_requests(uuid, boolean) TO service_role;
