-- 2026-05-25 — surface the caller's current group memberships in every RPC
-- that may change them (redeem_invite, leave_group) plus a read-only
-- `app_my_groups` RPC that powers the settings sheet on open.
--
-- The response shape grows by a `groups: [{id, name, enabled}, ...]` field
-- (jsonb array, sorted by name). The edge dispatcher passes this through as
-- a sidecar alongside the user payload (`{...user, groups}`), so the mobile
-- settings sheet can avoid an extra round-trip after every mutation.
--
-- Existing callers (deployed mobile) don't read `groups`, so the field is
-- additive / non-breaking.

CREATE OR REPLACE FUNCTION public._my_groups(me_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id',      g.id,
      'name',    g.name,
      'enabled', g.enabled
    ) ORDER BY g.name),
    '[]'::jsonb
  )
  FROM public.user_groups ug
  JOIN public.groups       g ON g.id = ug.group_id
  WHERE ug.user_id = me_id;
$$;
REVOKE EXECUTE ON FUNCTION public._my_groups(uuid) FROM anon, authenticated;

-- ===== Read-only: list the caller's groups =====
CREATE OR REPLACE FUNCTION public.app_my_groups(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',   result_user,
    'notify', '[]'::jsonb,
    'groups', public._my_groups(me_id)
  );
END;
$$;

-- ===== Augment app_redeem_invite to also return the post-join group list =====
CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_group_id  uuid;
  result_user json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id INTO v_group_id FROM public.groups
   WHERE invite_code = p_code AND enabled = true;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  INSERT INTO public.user_groups(user_id, group_id) VALUES (me_id, v_group_id)
    ON CONFLICT (user_id, group_id) DO NOTHING;

  UPDATE public.users
     SET relations = jsonb_set(
           relations,
           '{availability}',
           public.user_availability(user_id, location)
         )
   WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',   result_user,
    'notify', '[]'::jsonb,
    'groups', public._my_groups(me_id)
  );
END;
$$;

-- ===== Augment app_leave_group to also return the post-leave group list =====
CREATE OR REPLACE FUNCTION public.app_leave_group(me_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  DELETE FROM public.user_groups
   WHERE user_id = me_id AND group_id = p_group_id;

  UPDATE public.users
     SET relations = jsonb_set(
           relations,
           '{availability}',
           public.user_availability(user_id, location)
         )
   WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',   result_user,
    'notify', '[]'::jsonb,
    'groups', public._my_groups(me_id)
  );
END;
$$;
