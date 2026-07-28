-- Group description cap 300 -> 500 chars (user directive 2026-07-28).
-- Widening only: the published client capped its own input at 300, so no live
-- value can violate the new bound and no old build can send anything the new
-- RPCs reject. Nothing to stage, nothing for BACKWARD_COMPAT.md.
-- Both bodies are otherwise byte-identical to the live definitions.

CREATE OR REPLACE FUNCTION public.app_create_group(me_id uuid, p_name text, p_is_public boolean DEFAULT false, p_description text DEFAULT NULL::text, p_requires_approval boolean DEFAULT false, p_link text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_name text; v_desc text; v_link text; v_id uuid; v_code text; v_pub boolean; v_req boolean;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  v_desc := nullif(btrim(p_description), '');
  IF v_desc IS NOT NULL AND char_length(v_desc) > 500 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  v_link := public._group_link_norm(p_link);
  IF v_link = '' THEN RETURN jsonb_build_object('error', 'bad_link'); END IF;
  v_pub := coalesce(p_is_public, false);
  v_req := CASE WHEN v_pub THEN coalesce(p_requires_approval, false) ELSE true END;
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, description, link, requires_approval, is_test)
    VALUES (v_name, v_code, me_id, v_pub, v_desc, v_link, v_req, public._is_test(me_id))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', v_pub, 'owner', true, 'is_owner', true, 'members', 1,
    'requires_approval', v_req, 'description', v_desc, 'link', v_link, 'pending', 0));
END; $function$;

CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false, p_requires_approval boolean DEFAULT NULL::boolean, p_link text DEFAULT NULL::text, p_link_provided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_desc text; v_link text;
        v_pub boolean; v_req boolean;
        v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  IF p_desc_provided THEN
    v_desc := nullif(btrim(p_description), '');
    IF v_desc IS NOT NULL AND char_length(v_desc) > 500 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  IF p_link_provided THEN
    v_link := public._group_link_norm(p_link);
    IF v_link = '' THEN RETURN jsonb_build_object('error', 'bad_link'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), coalesce(p_requires_approval, g.requires_approval)
    INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req,
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END,
    link = CASE WHEN p_link_provided THEN v_link ELSE link END
   WHERE id = p_group_id;
  IF NOT v_req THEN v_notify := public._group_drain_requests(p_group_id); END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'link', g.link,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- CREATE OR REPLACE keeps existing ACLs, but restate them so a fresh apply of
-- this file lands the same grants as the originals (project convention).
REVOKE ALL ON FUNCTION public.app_create_group(uuid, text, boolean, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_update_group(uuid, uuid, text, boolean, text, boolean, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_create_group(uuid, text, boolean, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_update_group(uuid, uuid, text, boolean, text, boolean, boolean, text, boolean) TO service_role;
