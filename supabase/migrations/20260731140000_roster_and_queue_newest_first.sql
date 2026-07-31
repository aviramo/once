-- A group's two lists are read NEWEST FIRST (user directive 2026-07-31).
--
-- Both are one surface now — the waiting queue is a drawer at the top of the
-- roster it feeds (mobile: OwnedGroupView) — so a manager reads the page as one
-- thing: who arrived last. The queue used to be oldest-first, i.e. the manager
-- had to scroll a long queue to reach whoever had just knocked, and the roster
-- ran alphabetically inside each role, which said nothing about when anyone
-- came.
--
-- The ROSTER keeps its three ranks and sorts by date INSIDE each (same
-- directive, refined the same day): the owner, then the approvers, then the
-- plain members, each of those running from whoever joined last back to
-- whoever joined first. By date alone the owner fell to the bottom of his own
-- group. The name is the last tiebreaker and only for rows written in the same
-- instant. The QUEUE is purely newest-first: nobody in it has a role yet.
--
-- Order only: no field added, removed or retyped, and every other RPC that
-- returns either list delegates to these two (app_respond_join,
-- app_approve_all_joins, app_remove_member, app_set_manager,
-- app_transfer_owner), so the published mobile build simply receives the rows
-- in the new order. Nothing to stage.
CREATE OR REPLACE FUNCTION public.app_group_members(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_ok boolean := false;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id)
       OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  RETURN jsonb_build_object(
    'is_owner', (v_owner = me_id),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0,
        -- WHEN THIS PERSON TURNED UP HERE (user directive 2026-07-31): a
        -- person's page inside a group states it under the group's name, so the
        -- row carries it. Purely additive, and it is the very column the roster
        -- is ordered by, so the order and the line can never disagree. The
        -- queue's rows have carried their own `created_at` since they existed.
        'joined_at', ug.created_at,
        'owner',   (u.user_id = v_owner),
        'manager', (u.user_id = v_owner
                    OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id)),
        'profile', public.make_profile(u, NULL::int, me_id)
      ) ORDER BY
        (u.user_id = v_owner) DESC,
        (EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id)) DESC,
        ug.created_at DESC,
        u.name)
      FROM public.user_groups ug JOIN public.users u ON u.user_id = ug.user_id
      WHERE ug.group_id = p_group_id), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.app_group_requests(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_ok boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  RETURN jsonb_build_object('requests', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', jr.id, 'user_id', u.user_id, 'name', u.name,
      'image', u.data->'images'->0, 'created_at', jr.created_at,
      'profile', public.make_profile(u, NULL::int, me_id)
    ) ORDER BY jr.created_at DESC)
    FROM public.group_join_requests jr JOIN public.users u ON u.user_id = jr.user_id
    WHERE jr.group_id = p_group_id AND jr.status = 'pending'), '[]'::jsonb));
END; $function$;
