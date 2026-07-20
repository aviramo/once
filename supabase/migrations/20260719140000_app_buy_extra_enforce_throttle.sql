-- Enforce the documented buy-extra throttle server-side (CLAUDE.md
-- "Credits economy → Buy throttle"). Until now the RPC was a pure heart-add:
-- both gates lived only in the mobile UI (canBuyExtra), so any direct call
-- could top up without limit.
--
--   1. _credits_total(rel) > 0        -> 'has_credits'         (recovery only)
--   2. credits.bought_on = grant day  -> 'already_bought_today' (once/cycle)
--
-- On success the RPC stamps `bought_on` with the LIVE grant day
-- (_credits_grant_day()), not the user's stored granted_on which can lag the
-- per-minute cron by up to 60s, so the gate flips clean at the 20:00
-- Asia/Jerusalem boundary regardless of cron latency.

-- _credits_ensure rebuilds the whole credits subtree, so it must carry
-- bought_on forward or the throttle value is wiped by the next credit RPC.
CREATE OR REPLACE FUNCTION public._credits_ensure(rel jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN coalesce(rel, '{}'::jsonb) ? 'credits' THEN
      jsonb_set(rel, '{credits}', jsonb_strip_nulls(jsonb_build_object(
        'balance', COALESCE((rel->'credits'->>'balance')::int, 0),
        'extra',   COALESCE((rel->'credits'->>'extra')::int,   0),
        'held',    COALESCE((rel->'credits'->>'held')::int,    0),
        'granted_on',    rel->'credits'->>'granted_on',
        'next_grant_at', rel->'credits'->'next_grant_at',
        'bought_on',     rel->'credits'->>'bought_on'
      )))
    ELSE jsonb_set(coalesce(rel, '{}'::jsonb), '{credits}', public._credits_default())
  END
$function$;

CREATE OR REPLACE FUNCTION public.app_buy_extra(me_id uuid, p_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cnt       int := COALESCE(p_count, 0);
  v_rel       jsonb;
  v_day       text := public._credits_grant_day()::text;
  result_user json;
BEGIN
  IF v_cnt NOT IN (3, 10, 50) THEN
    RETURN jsonb_build_object('error', 'bad_count');
  END IF;

  SELECT relations INTO v_rel FROM public.users WHERE user_id = me_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  v_rel := public._credits_ensure(v_rel);

  IF public._credits_total(v_rel) > 0 THEN
    RETURN jsonb_build_object('error', 'has_credits');
  END IF;

  IF COALESCE(v_rel->'credits'->>'bought_on', '') = v_day THEN
    RETURN jsonb_build_object('error', 'already_bought_today');
  END IF;

  UPDATE public.users
  SET relations = jsonb_set(
    jsonb_set(
      v_rel,
      '{credits,extra}',
      to_jsonb(COALESCE((v_rel->'credits'->>'extra')::int, 0) + v_cnt)),
    '{credits,bought_on}',
    to_jsonb(v_day))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;
