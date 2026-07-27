-- Members and friends carry their profile too.
--
-- Tapping a person anywhere in the communities sheet now opens the same profile
-- card the app renders for a match, and the actions about them (make manager,
-- remove from group, remove friend) live on that page instead of in a popup
-- (user directive 2026-07-27). Same treatment the join queue already got:
-- `make_profile` with a NULL distance, so being in a group with someone is
-- never consent to reveal where you are.
--
-- Additive only: `name` / `image` / `owner` / `manager` stay exactly as they
-- were, so the published app is untouched.
CREATE OR REPLACE FUNCTION public.app_group_members(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
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
        'owner',   (u.user_id = v_owner),
        'manager', (u.user_id = v_owner
                    OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id)),
        'profile', public.make_profile(u, NULL::int, me_id)
      ) ORDER BY
        (u.user_id = v_owner) DESC,
        (EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id)) DESC,
        u.name)
      FROM public.user_groups ug JOIN public.users u ON u.user_id = ug.user_id
      WHERE ug.group_id = p_group_id), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.app_my_friends(me_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'friends', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0,
               'profile', public.make_profile(u, NULL::int, me_id)) ORDER BY u.name)
      FROM public.friend_links fl
      JOIN public.users u ON u.user_id = CASE WHEN fl.a = me_id THEN fl.b ELSE fl.a END
      WHERE fl.a = me_id OR fl.b = me_id), '[]'::jsonb),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', fr.id, 'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0) ORDER BY fr.created_at DESC)
      FROM public.friend_requests fr
      JOIN public.users u ON u.user_id = fr.requester_id
      WHERE fr.target_id = me_id AND fr.status = 'pending'), '[]'::jsonb)
  );
$function$;
