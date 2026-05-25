-- 2026-05-25 — per-group 6-digit invite codes. A group manager (or admin)
-- shares the code with a prospective member; the user enters it during the
-- onboarding final step (or from settings) and joins atomically. The code
-- lives on the groups row itself; "regenerate" mints a new unique 6-digit
-- code (the old one is invalidated). Joining is additive — a user can be a
-- member of multiple groups.

-- ===== Helper: random unique 6-digit code =====
-- Loops on collision (cheap — 6 digits = 1M slots, current group count < 10).
-- SECURITY DEFINER so it can SELECT from groups (RLS = service-role only)
-- regardless of caller context.
CREATE OR REPLACE FUNCTION public._group_generate_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code  text;
  v_tries int := 0;
BEGIN
  LOOP
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = v_code) THEN
      RETURN v_code;
    END IF;
    v_tries := v_tries + 1;
    IF v_tries > 100 THEN
      RAISE EXCEPTION 'unable to generate unique invite_code after 100 attempts';
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._group_generate_invite_code() FROM anon, authenticated;

-- ===== Schema: groups.invite_code =====
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS invite_code text;

-- Backfill any null code (first run; idempotent for re-runs).
UPDATE public.groups
   SET invite_code = public._group_generate_invite_code()
 WHERE invite_code IS NULL;

ALTER TABLE public.groups ALTER COLUMN invite_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'groups_invite_code_unique'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_invite_code_unique UNIQUE (invite_code);
  END IF;
END $$;

-- ===== RPC: app_redeem_invite (user-callable via /app/redeem_invite) =====
-- Validates the code, idempotently adds the user to the matching enabled
-- group, recomputes availability (joining an enabled group flips an all-
-- disabled-groups user back to available), returns {user, notify:[]}. Error
-- 'invite_invalid' for unknown / disabled / malformed codes. Success even
-- when the user is already a member (no-op).
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

  -- Idempotent: re-redeeming the same code on an existing membership succeeds.
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
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ===== RPC: app_leave_group (user-callable via /app/leave_group) =====
-- Removes the membership, recomputes availability. Idempotent — leaving a
-- group you're not in is a no-op success. The existing
-- _gm_cascade_on_membership_remove trigger cascades any group_managers grant
-- tied to this membership; we do not need to clean it up explicitly.
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
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ===== RPC: app_regenerate_invite_code (admin / group-manager driven) =====
-- SECURITY DEFINER + EXECUTE revoked — the web layer's action gates on
-- (admin OR group manager of p_group_id) before invoking via the service-
-- role client; the DB itself is the backstop. Returns {group_id, invite_code}
-- on success or {error:'group_not_found'} when the group_id is unknown.
CREATE OR REPLACE FUNCTION public.app_regenerate_invite_code(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_new_code text;
  v_rows     int;
BEGIN
  v_new_code := public._group_generate_invite_code();
  UPDATE public.groups SET invite_code = v_new_code WHERE id = p_group_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;
  RETURN jsonb_build_object('group_id', p_group_id, 'invite_code', v_new_code);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_regenerate_invite_code(uuid) FROM anon, authenticated;
