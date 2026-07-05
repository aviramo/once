-- Upgrading to Pro now immediately tops the wallet to the Pro maximum
-- (cap = 10 stars), instead of only flipping the tier label and waiting for
-- the next daily grant to reconcile. User request: "switching to Pro gives
-- the maximum stars".
--
-- DRY: the cap / grant-field logic stays owned by the _credits_* helpers.
-- This RPC just forces tier=pro then reuses _credits_reset_to_cap (the same
-- helper the admin reset uses), which rebuilds the credits object at the
-- (now Pro) tier's cap with held=0 and refreshed grant fields.
--
-- The Free branch is unchanged: it flips ONLY the tier label and preserves
-- balance / held / grant verbatim (the mobile UI no longer exposes a
-- downgrade, but the endpoint stays non-destructive if ever called with
-- tier='free').
--
-- Additive & backward compatible: app_set_tier is a brand-new RPC + endpoint
-- the currently-published mobile build never calls; the response shape
-- ({user, notify:[]}) is unchanged. No Expand/Contract staging, no
-- BACKWARD_COMPAT.md entry.

CREATE OR REPLACE FUNCTION public.app_set_tier(me_id uuid, new_tier text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_tier      text := lower(coalesce(new_tier, ''));
  result_user json;
BEGIN
  IF v_tier NOT IN ('free', 'pro') THEN
    RETURN jsonb_build_object('error', 'bad_tier');
  END IF;

  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF v_tier = 'pro' THEN
    -- Set tier=pro first, then _credits_reset_to_cap reads that tier and
    -- rebuilds the credits object at its cap (balance = 10, held = 0,
    -- granted_on / next_grant_at refreshed to the current grant day).
    UPDATE public.users
    SET relations = jsonb_set(
      public._credits_ensure(relations),
      '{credits}',
      public._credits_reset_to_cap(
        jsonb_set(public._credits_ensure(relations), '{credits,tier}', to_jsonb(v_tier))
      )
    )
    WHERE user_id = me_id;
  ELSE
    -- Switching to Free flips ONLY the tier label; balance / held / grant
    -- fields are preserved verbatim.
    UPDATE public.users
    SET relations = jsonb_set(public._credits_ensure(relations), '{credits,tier}', to_jsonb(v_tier))
    WHERE user_id = me_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;
