-- User-initiated credit-tier switch (free <-> pro), changeable at any time
-- with no limit. Changing tier does NOT change the current balance / held /
-- grant fields — only the tier label flips. The daily grant
-- (app_credits_grant) naturally reconciles the balance to the new tier's cap
-- on the next 20:00 Asia/Jerusalem boundary (LEAST(cap, balance + daily)).
--
-- Additive & backward compatible: brand-new RPC + a new /app/set_tier
-- endpoint. The currently-published mobile build never calls it, so this is
-- safe to deploy to 100% of users immediately (no Expand/Contract staging,
-- no BACKWARD_COMPAT.md entry).
--
-- Tier amounts (free 5 / pro 10) are owned by _credits_tier_cfg and are NOT
-- duplicated here — this RPC only writes the tier string; the cap/daily come
-- from _credits_tier_cfg wherever they're needed (grant, refund).

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

  -- _credits_ensure first so a credit-less row is seeded with a well-formed
  -- wallet, then flip ONLY the tier. balance / held / granted_on /
  -- next_grant_at are preserved verbatim (switching plans never changes how
  -- many stars the user currently has).
  UPDATE public.users
  SET relations = jsonb_set(public._credits_ensure(relations), '{credits,tier}', to_jsonb(v_tier))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;
