-- Refund stops overflowing into `extra`: a refunded DAILY credit is dropped
-- when the daily pool is already full, so the wallet cannot climb above the
-- cap (user request 2026-07-22, "so he stays at one").
--
-- Until now _credits_refund did LEAST(cap, bal + amt) and pushed the surplus
-- into `extra` ("no credits are ever lost on a hold+refund cycle"). With a cap
-- of 3 that almost never fired; with a cap of 1 it fires on every invite that
-- outlives the 20:00 grant, and the user would quietly accumulate a stock of
-- free credits the daily pool is supposed to prevent.
--
-- But a held credit is not always a daily credit. _credits_charge spends
-- balance FIRST and `extra` second, so a user with an empty daily pool holds a
-- PURCHASED credit — and the app promises purchased credits never expire
-- ("הקרדיטים שתקנה ... לא יתבטלו עם הזמן" / "Credits you buy ... never
-- expire"). Dropping those would be burning something a user paid for, which
-- matters the moment real billing is wired up.
--
-- So the hold now remembers WHERE it came from: `credits.held_extra` counts
-- how many of the held credits were taken out of `extra`. On refund those go
-- home to `extra` untouched; only the daily part tops the balance up to the
-- cap, and whatever doesn't fit is dropped.
--
--   held from daily,    balance < cap  -> back to balance
--   held from daily,    balance = cap  -> DROPPED (the new rule)
--   held from purchase                 -> always back to `extra`
--
-- Server-only accounting: no client reads `held` or `held_extra`.

-- 1) Carry the new key through the subtree rebuild (same reason as
--    `bought_on` / `unpaid_at`).

CREATE OR REPLACE FUNCTION public._credits_ensure(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN coalesce(rel, '{}'::jsonb) ? 'credits' THEN
      jsonb_set(rel, '{credits}', jsonb_strip_nulls(jsonb_build_object(
        'balance',    COALESCE((rel->'credits'->>'balance')::int, 0),
        'extra',      COALESCE((rel->'credits'->>'extra')::int,   0),
        'held',       COALESCE((rel->'credits'->>'held')::int,    0),
        'held_extra', COALESCE((rel->'credits'->>'held_extra')::int, 0),
        'granted_on',    rel->'credits'->>'granted_on',
        'next_grant_at', rel->'credits'->'next_grant_at',
        'bought_on',     rel->'credits'->>'bought_on',
        'unpaid_at',     rel->'credits'->>'unpaid_at'
      )))
    ELSE jsonb_set(coalesce(rel, '{}'::jsonb), '{credits}', public._credits_default())
  END
$$;

-- 2) Hold records the purchased share. _credits_charge takes balance first, so
--    anything beyond the pre-charge balance came out of `extra`.

CREATE OR REPLACE FUNCTION public._credits_hold(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH v AS (
    SELECT public._credits_ensure(rel) AS r, GREATEST(0, amount) AS amt
  ), s AS (
    SELECT v.amt,
           COALESCE((v.r->'credits'->>'balance')::int, 0) AS bal_before,
           public._credits_charge(v.r, v.amt) AS r
    FROM v
  )
  SELECT jsonb_set(
           jsonb_set(s.r, '{credits,held}',
             to_jsonb(GREATEST(0, COALESCE((s.r->'credits'->>'held')::int, 0) + s.amt))),
           '{credits,held_extra}',
             to_jsonb(GREATEST(0, COALESCE((s.r->'credits'->>'held_extra')::int, 0)
                                  + GREATEST(0, s.amt - s.bal_before))))
  FROM s
$$;

-- 3) Refund: purchased part home to `extra`, daily part up to the cap, the
--    rest dropped. Still clears the unpaid mark — money coming back is a
--    funding event.

CREATE OR REPLACE FUNCTION public._credits_refund(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH r AS (
    SELECT public._credits_ensure(rel) AS r, GREATEST(0, amount) AS amt
  ), v AS (
    SELECT r.r,
           COALESCE((r.r->'credits'->>'balance')::int,    0) AS bal,
           COALESCE((r.r->'credits'->>'extra')::int,      0) AS ext,
           COALESCE((r.r->'credits'->>'held')::int,       0) AS hld,
           COALESCE((r.r->'credits'->>'held_extra')::int, 0) AS hex,
           r.amt,
           public._credits_cap() AS cap
    FROM r
  ), s AS (
    SELECT v.*, LEAST(v.amt, v.hex) AS to_extra FROM v
  )
  SELECT public._credits_clear_unpaid(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(s.r, '{credits,balance}',
                   -- Daily part only, and never past the cap: the surplus is
                   -- deliberately dropped so a refund can't stockpile.
                   to_jsonb(LEAST(s.cap, s.bal + (s.amt - s.to_extra)))),
                 '{credits,extra}',
                   to_jsonb(s.ext + s.to_extra)),
               '{credits,held}',
                 to_jsonb(GREATEST(0, s.hld - s.amt))),
             '{credits,held_extra}',
               to_jsonb(GREATEST(0, s.hex - s.to_extra))))
  FROM s
$$;

-- 4) Forfeit (app_cancel) drops the hold without returning anything, so the
--    purchased counter has to come down with it or a later refund would hand
--    back credits that were already forfeited.

CREATE OR REPLACE FUNCTION public._credits_clear_hold(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH r AS (SELECT public._credits_ensure(rel) AS rel, GREATEST(0, amount) AS amt)
  SELECT jsonb_set(
           jsonb_set(r.rel, '{credits,held}',
             to_jsonb(GREATEST(0, COALESCE((r.rel->'credits'->>'held')::int, 0) - r.amt))),
           '{credits,held_extra}',
             to_jsonb(GREATEST(0, COALESCE((r.rel->'credits'->>'held_extra')::int, 0) - r.amt)))
  FROM r
$$;

-- 5) Backfill: every wallet holding a credit right now predates the counter.
--    Attribute those holds to the pool they most likely came from — `extra`
--    only where the wallet actually has purchased credits to have spent (and
--    nobody has ever bought any, so in practice this sets 0 everywhere).

UPDATE public.users
SET relations = jsonb_set(
  public._credits_ensure(relations),
  '{credits,held_extra}',
  to_jsonb(LEAST(
    COALESCE((relations->'credits'->>'held')::int,  0),
    COALESCE((relations->'credits'->>'extra')::int, 0))))
WHERE user_id IS NOT NULL
  AND COALESCE((relations->'credits'->>'held')::int, 0) > 0;
