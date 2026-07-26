-- 2026-07-26 — redeem_invite accepts any invite_code format, not only 6 digits.
--
-- Bug: public-group "Join" from search (FindView) redeems the group's
-- invite_code. app_redeem_invite hard-rejected anything that wasn't exactly
-- six digits (p_code !~ '^[0-9]{6}$'), but not every group has a 6-digit code:
-- admin/seed-created and special groups carry slug codes (e.g. 'bgu-e058b1c6',
-- 'shared-om-...'). Tapping Join on such a group flashed "Joined" (optimistic)
-- then reverted to "Join" (redeem returned 'invite_invalid' → the client's
-- catch rolled the optimistic state back).
--
-- Fix: drop the 6-digit format guard. The lookup `WHERE invite_code = p_code`
-- plus the `v_group_id IS NULL → invite_invalid` check already reject any code
-- that doesn't match a real group, so accepting other formats is safe. A length
-- cap keeps a garbage payload from hitting the index. This is a strict SUPERSET
-- of the previously-accepted input, so it is backward compatible: the deployed
-- build's 6-digit manual-entry path still works unchanged.

CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_group_id   uuid;
  v_group_name text;
  v_requires   boolean;
  v_is_member  boolean;
  v_is_staff   boolean;
  v_status     text := 'joined';
  v_notify     jsonb := '[]'::jsonb;
  result_user  json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR char_length(p_code) > 64 THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id, name, requires_approval INTO v_group_id, v_group_name, v_requires
    FROM public.groups WHERE invite_code = p_code;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM public.user_groups WHERE user_id = me_id AND group_id = v_group_id);
  v_is_staff  := EXISTS(SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.owner_id = me_id)
              OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);

  IF v_is_member THEN
    v_status := 'already';
  ELSIF v_requires AND NOT v_is_staff THEN
    INSERT INTO public.group_join_requests(group_id, user_id)
      VALUES (v_group_id, me_id) ON CONFLICT (group_id, user_id) DO NOTHING;
    v_status := 'pending';
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
             'user_id', staff_id, 'code', 'group_join',
             'group_id', v_group_id, 'group_name', v_group_name)), '[]'::jsonb)
      INTO v_notify
      FROM (
        SELECT g.owner_id AS staff_id FROM public.groups g WHERE g.id = v_group_id AND g.owner_id IS NOT NULL
        UNION
        SELECT gm.user_id FROM public.group_managers gm WHERE gm.group_id = v_group_id
      ) staff
      WHERE staff_id <> me_id;
  ELSE
    INSERT INTO public.user_groups(user_id, group_id) VALUES (me_id, v_group_id)
      ON CONFLICT (user_id, group_id) DO NOTHING;
    UPDATE public.users
       SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
     WHERE user_id = me_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',        result_user,
    'notify',      v_notify,
    'groups',      public._my_groups(me_id),
    'join_status', v_status
  );
END;
$function$;
