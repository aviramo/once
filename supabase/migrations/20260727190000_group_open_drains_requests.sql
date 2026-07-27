-- Switching a group to OPEN admits everyone who was waiting.
--
-- A pending request means "I asked to be let in". Once the group admits anyone
-- who finds it, that request has no reason left to wait: leaving the queue
-- behind strands the requesters (they would only get in by chancing on the link
-- again) and leaves the owner a queue that contradicts the kind they just chose
-- (user question 2026-07-27). The other transitions need nothing: approved and
-- private both approve, so their queue keeps its meaning, and no switch ever
-- touches existing members.
--
-- `app_update_group` therefore returns `notify` now (both overloads), and the
-- edge function dispatches it exactly like app_respond_join's.
CREATE OR REPLACE FUNCTION public._group_drain_requests(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_test boolean; v_notify jsonb;
BEGIN
  SELECT g.name, g.is_test INTO v_name, v_test FROM public.groups g WHERE g.id = p_group_id;
  -- The test partition still holds: only requesters on the group's own side can
  -- become members. The rest of the queue is dropped with it, since they could
  -- never have been admitted anyway.
  INSERT INTO public.user_groups(user_id, group_id)
    SELECT jr.user_id, jr.group_id
      FROM public.group_join_requests jr
     WHERE jr.group_id = p_group_id
       AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test
    ON CONFLICT (user_id, group_id) DO NOTHING;
  -- Built BEFORE the delete: the same push an individual approval sends.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', jr.user_id, 'code', 'group_approved',
           'group_id', p_group_id, 'group_name', v_name)), '[]'::jsonb)
    INTO v_notify
    FROM public.group_join_requests jr
   WHERE jr.group_id = p_group_id
     AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test;
  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{availability}', public.user_availability(u.user_id, u.location))
   WHERE u.user_id IN (SELECT jr.user_id FROM public.group_join_requests jr WHERE jr.group_id = p_group_id);
  DELETE FROM public.group_join_requests WHERE group_id = p_group_id;
  RETURN v_notify;
END; $function$;

CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false, p_requires_approval boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_desc text; v_pub boolean; v_req boolean;
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
    IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), coalesce(p_requires_approval, g.requires_approval)
    INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  -- The kind invariant: hidden means approved.
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req,
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END
   WHERE id = p_group_id;
  -- Now OPEN: nobody is left waiting for an approval that no longer exists.
  IF NOT v_req THEN v_notify := public._group_drain_requests(p_group_id); END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_pub boolean; v_req boolean;
        v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), g.requires_approval INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req
   WHERE id = p_group_id;
  IF NOT v_req THEN v_notify := public._group_drain_requests(p_group_id); END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;
