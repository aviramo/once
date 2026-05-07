-- Boost schedule_overlap output range when both sides have kids and schedules.
-- Previously returned 0..1 in that case, alongside 1.0 for the no-kids/no-schedule
-- fallback — meaning a no-schedule pair always scored higher than a partially-
-- overlapping kids pair. New behavior: kids-with-schedule pairs return 1..2 so
-- that any overlap outranks the no-schedule fallback, and more overlap outranks
-- less overlap. Fallback stays at 1.0.

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
    IF NOT arr_a[((shift_a + i) % ca) + 1]
       AND NOT arr_b[((shift_b + i) % cb) + 1]
    THEN
      both_free := both_free + 1;
    END IF;
  END LOOP;

  RETURN 1.0 + both_free::double precision / cycle::double precision;
END;
$$;
