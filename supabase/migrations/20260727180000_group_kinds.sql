-- Three group kinds instead of two independent booleans (user directive
-- 2026-07-27).
--
--   open     — in search, joins instantly          (is_public, no approval)
--   approved — in search, every join is approved   (is_public, approval)
--   private  — not in search, link/invite only,
--              and every join is approved          (not public, approval)
--
-- The kind is DERIVED from the two columns the published app already reads, so
-- there is no new column, no new payload field and nothing to stage: the app in
-- the field keeps reading is_public / requires_approval and keeps behaving
-- correctly. What changes is that the fourth combination — private with
-- instant link joins — no longer exists: a link into a hidden group now opens
-- a request instead of letting a stranger in silently.
--
-- Enforced in the write paths (both overloads of each RPC, since the older one
-- is still reachable from a published build), NOT as a CHECK constraint: the QA
-- seed scripts insert groups directly and a constraint would fail them at a
-- distance rather than at the call site.

-- 1. Create: a group that is not public always requires approval.
CREATE OR REPLACE FUNCTION public.app_create_group(me_id uuid, p_name text, p_is_public boolean DEFAULT false, p_description text DEFAULT NULL::text, p_requires_approval boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_desc text; v_id uuid; v_code text; v_pub boolean; v_req boolean;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  v_desc := nullif(btrim(p_description), '');
  IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  v_pub := coalesce(p_is_public, false);
  -- The kind invariant: hidden means approved.
  v_req := CASE WHEN v_pub THEN coalesce(p_requires_approval, false) ELSE true END;
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, description, requires_approval, is_test)
    VALUES (v_name, v_code, me_id, v_pub, v_desc, v_req, public._is_test(me_id))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', v_pub, 'owner', true, 'is_owner', true, 'members', 1,
    'requires_approval', v_req, 'description', v_desc, 'pending', 0));
END; $function$;

-- The legacy 3-arg overload a published build can still resolve to.
CREATE OR REPLACE FUNCTION public.app_create_group(me_id uuid, p_name text, p_is_public boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_id uuid; v_code text; v_pub boolean;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  v_pub := coalesce(p_is_public, false);
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, requires_approval, is_test)
    VALUES (v_name, v_code, me_id, v_pub, NOT v_pub, public._is_test(me_id))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', v_pub, 'owner', true, 'members', 1));
END; $function$;

-- 2. Update: same invariant, applied to the RESULTING row — so flipping a group
--    to hidden turns approval on even when the caller only sent one flag (which
--    is exactly what a published build does).
CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false, p_requires_approval boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_desc text; v_pub boolean; v_req boolean;
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
    IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), coalesce(p_requires_approval, g.requires_approval)
    INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req,
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END
   WHERE id = p_group_id;
  RETURN (SELECT jsonb_build_object('group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- The legacy 4-arg overload.
CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_pub boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public) INTO v_pub FROM public.groups g WHERE g.id = p_group_id;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = CASE WHEN v_pub THEN requires_approval ELSE true END
   WHERE id = p_group_id;
  RETURN (SELECT jsonb_build_object('group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- 3. The rows that are in the combination that no longer exists. Nothing is
--    lost: their invite links keep working, they now open a request. (5 rows
--    at the time of writing; the friend-links set is NOT a groups row and is
--    untouched, so "my friends" keeps linking instantly.)
UPDATE public.groups SET requires_approval = true
 WHERE is_public = false AND requires_approval = false;
