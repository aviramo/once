-- 2026-05-25 — restore the `groups` sidecar to app_redeem_invite's response.
-- The mobile settings sheet and the onboarding final step both want the
-- updated group list back in the same round trip; a follow-on migration
-- (drop_group_disable) had simplified the RPC body and inadvertently
-- removed the sidecar. The body change otherwise matches that simpler
-- version (no `enabled = true` filter — the column was dropped; no
-- availability flip — group membership no longer gates).
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

  SELECT id INTO v_group_id FROM public.groups WHERE invite_code = p_code;
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
