-- Add location_custom to the Profile snapshot so the mobile app can swap the
-- distance chip icon (pin → home) when the snapshotted side picked a manual
-- address instead of GPS. Distance computed against a fixed address doesn't
-- represent live proximity, so the chip needs a visual marker.
--
-- Backfill: snapshots in users.relations get refreshed lazily by
-- app_refresh_snapshots on every endpoint call (except delete/reset). No
-- explicit backfill needed — within one call per user, every existing
-- snapshot will carry the new key.

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
    'location_custom', CASE WHEN (u.data->>'location_custom')::boolean = true
                            THEN true
                            ELSE NULL END
  ))
$$;
