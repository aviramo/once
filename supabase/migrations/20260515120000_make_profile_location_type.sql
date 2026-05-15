-- Typed location anchors: data.location_type ∈ {device, home, work} supersedes
-- the boolean data.location_custom. make_profile now embeds location_type so a
-- viewer's distance chip can pick the right icon (pin / home / work) for the
-- snapshotted side.
--
-- Backward compat (Expand): keep emitting location_custom too. Mobile builds
-- that predate the typed model only read match.location_custom; dropping it
-- would break their distance chip. Rows last written by such a build carry
-- only location_custom (no location_type) — we surface a derived
-- location_type='home' for them so new builds reading those snapshots get a
-- sensible typed value (matching the client-side fallback). See
-- BACKWARD_COMPAT.md for the Contract step.
--
-- Stripping rules elsewhere (app_refresh_snapshots: distance/last_seen) are
-- unchanged — they operate on the make_profile output regardless of which
-- location keys it carries.

CREATE OR REPLACE FUNCTION public.make_profile(u public.users, dist_m int)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'user_id',     u.user_id,
    'title',       u.name || ', ' || extract(year from age(now(), u.birth_date::timestamp with time zone))::text,
    'name',        u.name,
    'images',      COALESCE(u.data->'images', '[]'::jsonb),
    'bio',         CASE WHEN length(trim(coalesce(u.data->>'bio',''))) > 0
                        THEN u.data->>'bio'
                        ELSE NULL END,
    'family',      CASE WHEN jsonb_typeof(u.data->'family') = 'object'
                        THEN u.data->'family'
                        ELSE NULL END,
    'is_male',     u.is_male,
    'last_seen',   u.last_seen,
    'distance',    dist_m,
    'location_custom', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          OR (u.data->>'location_custom')::boolean = true
        THEN true
        ELSE NULL END,
    'location_type', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          THEN u.data->>'location_type'
        WHEN (u.data->>'location_type') IS NULL
          AND (u.data->>'location_custom')::boolean = true
          THEN 'home'
        ELSE NULL END
  ))
$$;
