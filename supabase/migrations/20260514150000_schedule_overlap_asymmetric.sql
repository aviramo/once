-- schedule_overlap: switch denominator from full cycle to A's free days.
-- The function now expresses "out of A's kid-free days, what fraction is
-- B also kid-free" — matching the asymmetric semantics shown in the mobile
-- family chip (which is computed for the viewer A looking at candidate B).
--
-- Output range stays 0..2 so the relevance product behaves the same:
--   0.0  → B is never free when A is free (exclude from A's pool)
--   1.0  → B is free on half of A's free days, OR fallback (no signal)
--   2.0  → B is free on every one of A's free days
--
-- Edge cases:
--   - Either side missing kids/schedule → 1.0 (neutral, unchanged).
--   - A has zero free days in the cycle → 1.0 (no signal to rank by).

CREATE OR REPLACE FUNCTION public.schedule_overlap(me_data jsonb, other_data jsonb)
RETURNS double precision
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  me_weeks     jsonb;
  other_weeks  jsonb;
  arr_a        bool[];
  arr_b        bool[];
  ca           int;
  cb           int;
  cycle        int;
  default_anc  date := current_date - extract(dow from current_date)::int;
  anc_a        date := default_anc;
  anc_b        date := default_anc;
  shift_a      int;
  shift_b      int;
  i            int;
  a_free       int := 0;
  both_free    int := 0;
BEGIN
  IF NOT (
    jsonb_typeof(me_data->'family') = 'object'
    AND jsonb_typeof(other_data->'family') = 'object'
    AND COALESCE((me_data->'family'->>'hasKids')::bool, false)
    AND COALESCE((other_data->'family'->>'hasKids')::bool, false)
  ) THEN
    RETURN 1.0;
  END IF;

  me_weeks    := me_data->'family'->'schedule'->'weeks';
  other_weeks := other_data->'family'->'schedule'->'weeks';
  IF jsonb_typeof(me_weeks) IS DISTINCT FROM 'array'
     OR jsonb_typeof(other_weeks) IS DISTINCT FROM 'array'
     OR jsonb_array_length(me_weeks) = 0
     OR jsonb_array_length(other_weeks) = 0
  THEN
    RETURN 1.0;
  END IF;

  SELECT array_agg(COALESCE((w.week->>d_idx)::bool, false) ORDER BY w.ord, d_idx)
    INTO arr_a
  FROM jsonb_array_elements(me_weeks) WITH ORDINALITY w(week, ord)
  CROSS JOIN generate_series(0, 6) d_idx;

  SELECT array_agg(COALESCE((w.week->>d_idx)::bool, false) ORDER BY w.ord, d_idx)
    INTO arr_b
  FROM jsonb_array_elements(other_weeks) WITH ORDINALITY w(week, ord)
  CROSS JOIN generate_series(0, 6) d_idx;

  ca := array_length(arr_a, 1);
  cb := array_length(arr_b, 1);
  cycle := ca * cb / gcd(ca, cb);

  BEGIN
    anc_a := COALESCE((me_data->'family'->'schedule'->>'anchor')::date, default_anc);
  EXCEPTION WHEN OTHERS THEN anc_a := default_anc;
  END;
  BEGIN
    anc_b := COALESCE((other_data->'family'->'schedule'->>'anchor')::date, default_anc);
  EXCEPTION WHEN OTHERS THEN anc_b := default_anc;
  END;

  shift_a := (((current_date - anc_a) % ca) + ca) % ca;
  shift_b := (((current_date - anc_b) % cb) + cb) % cb;

  FOR i IN 0..cycle - 1 LOOP
    IF NOT arr_a[((shift_a + i) % ca) + 1] THEN
      a_free := a_free + 1;
      IF NOT arr_b[((shift_b + i) % cb) + 1] THEN
        both_free := both_free + 1;
      END IF;
    END IF;
  END LOOP;

  IF a_free = 0 THEN
    RETURN 1.0;
  END IF;

  RETURN 2.0 * both_free::double precision / a_free::double precision;
END;
$$;
