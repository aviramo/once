-- The one way an account changes world after its first fix: somebody says so.
-- An Israeli who installed the app abroad, a device that ends up in the wrong
-- pool, a seeded row being retired.
--
-- It is not a bare UPDATE, because the account may be mid-game: a live watch,
-- a pending invitation or an open chat would survive the move and straddle two
-- worlds, which is exactly the mess public.others() partitions to prevent. So
-- both boards are released first, through the admin RPCs that already know how
-- to repair the counterparty. The circles the account OWNS follow it, and the
-- lock is re-stamped so no later GPS fix can undo the decision.
CREATE OR REPLACE FUNCTION public.app_admin_set_env(p_user_id uuid, p_env text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_before text; v_groups int;
BEGIN
  IF p_env NOT IN ('il','review','dev') THEN
    RETURN jsonb_build_object('error', 'bad_env');
  END IF;
  SELECT u.env INTO v_before FROM public.users u WHERE u.user_id = p_user_id;
  IF v_before IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF v_before = p_env THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'env', p_env, 'changed', false);
  END IF;

  PERFORM public.app_admin_release_page1(p_user_id);
  PERFORM public.app_admin_release_page2(p_user_id);

  UPDATE public.users
     SET env  = p_env,
         data = coalesce(data, '{}'::jsonb)
                || jsonb_build_object('env_locked_at', to_jsonb(now()), 'env_from', 'admin')
   WHERE user_id = p_user_id;

  UPDATE public.groups SET env = p_env WHERE owner_id = p_user_id AND env IS DISTINCT FROM p_env;
  GET DIAGNOSTICS v_groups = ROW_COUNT;

  RETURN jsonb_build_object('user_id', p_user_id, 'from', v_before, 'env', p_env,
                            'changed', true, 'groups_moved', v_groups);
END;
$$;

REVOKE ALL ON FUNCTION public.app_admin_set_env(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_admin_set_env(uuid, text) TO service_role;
