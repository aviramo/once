-- Daily grant 2026-07-28: one credit a day, and ONLY to a wallet that holds
-- nothing at all (user directive).
--
-- WHY. The grant was a TOP-UP: `LEAST(cap, balance + cap)`, run for every user
-- whose `granted_on` wasn't today. With cap = 1 that meant anyone sitting at 0
-- balance got a credit every day even while holding purchased `extra` -- so a
-- user who bought a 3-pack kept collecting free credits on top of it, and the
-- product's paid path competed with a free refill. The rule the app now states
-- in the buy popup ("when your credits run out, one new credit arrives every
-- day at HH:MM") is the rule the server has to enforce: the daily credit is
-- what you get when you have NOTHING, not a floor under every wallet.
--
-- WHAT CHANGES.
--   * The grant pays only when balance + extra + held = 0. `held` counts: a
--     held credit is an invite of the user's own in flight, i.e. a credit they
--     still have -- and paying on top of it would let the refund overflow into
--     `extra` (_credits_refund spills above the cap), handing out two credits
--     for one day.
--   * Everyone selected is still STAMPED (`granted_on` + `next_grant_at`),
--     whether or not they were paid. This is load-bearing: the cron ticks every
--     MINUTE, so leaving a skipped user unstamped would turn the grant into
--     "credit them the instant they go broke, at any hour" -- exactly what
--     "one a day, at 20:00" is not. Being ineligible at the grant moment costs
--     you that day.
--   * `unpaid_at` is cleared only on the paying branch, since only that branch
--     funds the wallet.
--   * Set-based single UPDATE instead of the per-user loop, and the result adds
--     `granted` (paid) beside `processed` (stamped). ext/index.ts reports
--     `granted` now; nothing else reads either.
--
-- No client-visible shape changes: the wallet keys are untouched.

CREATE OR REPLACE FUNCTION public.app_credits_grant()
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_day  date        := public._credits_grant_day();
  v_next timestamptz := public._credits_next_grant_at();
  v_cap  int         := public._credits_cap();
  cnt    int := 0;
  paid   int := 0;
BEGIN
  WITH tgt AS (
    SELECT u.user_id, public._credits_ensure(u.relations) AS rel
    FROM public.users u
    WHERE COALESCE(u.relations->'credits'->>'granted_on', '') <> v_day::text
  ), v AS (
    SELECT
      t.user_id,
      t.rel,
      COALESCE((t.rel->'credits'->>'balance')::int, 0)
      + COALESCE((t.rel->'credits'->>'extra')::int, 0)
      + COALESCE((t.rel->'credits'->>'held')::int,  0) = 0 AS empty
    FROM tgt t
  ), stamped AS (
    SELECT
      v.user_id,
      v.empty,
      jsonb_set(
        jsonb_set(v.rel, '{credits,granted_on}', to_jsonb(v_day::text)),
        '{credits,next_grant_at}', to_jsonb(v_next)) AS rel
    FROM v
  ), upd AS (
    UPDATE public.users u
    SET relations = CASE
      WHEN s.empty THEN public._credits_clear_unpaid(
        jsonb_set(s.rel, '{credits,balance}', to_jsonb(v_cap)))
      ELSE s.rel
    END
    FROM stamped s
    WHERE u.user_id = s.user_id
    RETURNING s.empty
  )
  SELECT count(*), count(*) FILTER (WHERE upd.empty) INTO cnt, paid FROM upd;

  RETURN jsonb_build_object('processed', cnt, 'granted', paid, 'day', v_day::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_credits_grant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_credits_grant() TO service_role;
