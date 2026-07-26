-- 2026-07-25 — Multi-manager support (Communities). Additive: reuses the
-- existing group_managers table + its membership-removal cascade. Broadens the
-- roster (manager flag), the managed-groups list (owner OR manager), and the
-- remove/update permissions to managers; manager promotion is owner-only.
-- Applied live via MCP as `communities_multi_manager`; kept here for the repo.

CREATE OR REPLACE FUNCTION public.app_group_members(me_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
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
                    OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id))
      ) ORDER BY
        (u.user_id = v_owner) DESC,
        (EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = p_group_id AND gm.user_id = u.user_id)) DESC,
        u.name)
      FROM public.user_groups ug JOIN public.users u ON u.user_id = ug.user_id
      WHERE ug.group_id = p_group_id), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.app_owned_groups(me_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
    'is_owner', (g.owner_id = me_id),
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)
  ) ORDER BY (g.owner_id = me_id) DESC, g.created_at DESC), '[]'::jsonb)
  FROM public.groups g
  WHERE g.owner_id = me_id
     OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = me_id);
$$;

CREATE OR REPLACE FUNCTION public.app_remove_member(me_id uuid, p_group_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner uuid; v_is_owner boolean; v_is_manager boolean; v_target_manager boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_is_owner := (v_owner = me_id);
  v_is_manager := v_is_owner OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_is_manager THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'cant_remove_owner'); END IF;
  v_target_manager := EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = p_user_id);
  IF v_target_manager AND NOT v_is_owner THEN RETURN jsonb_build_object('error', 'owner_only'); END IF;
  DELETE FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id;
  UPDATE public.users
     SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
   WHERE user_id = p_user_id;
  RETURN public.app_group_members(me_id, p_group_id);
END; $$;

CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL, p_is_public boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner uuid; v_ok boolean; v_name text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  UPDATE public.groups SET name = coalesce(v_name, name), is_public = coalesce(p_is_public, is_public)
   WHERE id = p_group_id;
  RETURN (SELECT jsonb_build_object('group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $$;

CREATE OR REPLACE FUNCTION public.app_set_manager(me_id uuid, p_group_id uuid, p_user_id uuid, p_make boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'owner_only'); END IF;
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'is_owner'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;
  IF p_make THEN
    INSERT INTO public.group_managers(user_id, group_id) VALUES (p_user_id, p_group_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.group_managers WHERE group_id = p_group_id AND user_id = p_user_id;
  END IF;
  RETURN public.app_group_members(me_id, p_group_id);
END; $$;
