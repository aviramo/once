-- Rescale kids_preference_match per user spec (2026-05-17).
--
-- Old truth table: same->1.0, opposite->0.0, one set->0.5, neither->1.0
-- New truth table (user-specified):
--   both set + same value        -> 2.0  (boost — both want the same re: kids)
--   both set + different values  -> 0.5  (soft penalty, no longer a hard exclude)
--   exactly one set              -> 1.0  (no signal — neutral)
--   neither set                  -> 1.0  (no signal — neutral)
--
-- "one set" and "neither set" collapse to the same 1.0, so the second WHEN
-- branch is gone. Signature and return type unchanged; `others` calls this by
-- name so the new body is picked up with no re-emit. Server-side ranking only
-- (relevance_kids is not read by the client) -> not a client-breaking change.
-- schedule_overlap is intentionally left untouched.

CREATE OR REPLACE FUNCTION public.kids_preference_match(me_data jsonb, other_data jsonb)
RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    CASE
      WHEN jsonb_typeof(me_data->'family'->'isForKids') = 'boolean'
       AND jsonb_typeof(other_data->'family'->'isForKids') = 'boolean'
      THEN CASE
        WHEN (me_data->'family'->>'isForKids')::bool = (other_data->'family'->>'isForKids')::bool
          THEN 2.0 ELSE 0.5
      END
      ELSE 1.0
    END
$$;
