-- 2026-07-26 — Shared-group "+N more" hint (additive Expand).
--
-- The group chip shows exactly ONE name: the smallest shared group, via
-- _shared_group_name. When a pair shares MORE than one group, we now surface
-- the count of the *extra* groups so the UI can draw a small "+N" badge inside
-- that chip. Purely additive — a new `group_extra` field on make_profile's
-- output, NULL (and thus stripped by jsonb_strip_nulls) when the pair shares 0
-- or 1 groups. Installed apps never read it, so this is backward-compatible with
-- no Expand→Contract staging needed. _shared_group_name and the ×3 relevance
-- boost are untouched: the extra groups change only the chip, not ranking.

-- Count of groups a pair shares (0, 1, 2, …). Mirrors _shared_group_name's
-- join so the "+N" always agrees with the displayed name.
CREATE OR REPLACE FUNCTION public._shared_group_count(p_a uuid, p_b uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COUNT(*)::int
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  WHERE ug_a.user_id = p_a
    AND ug_b.user_id = p_b
$$;

CREATE OR REPLACE FUNCTION public.make_profile(u users, dist_m integer, viewer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
        ELSE NULL END,
    'group_name',  CASE WHEN viewer_id IS NOT NULL
                        THEN public._shared_group_name(viewer_id, u.user_id)
                        ELSE NULL END,
    -- Extra shared groups beyond the one named above. NULLIF strips it to NULL
    -- (dropped by jsonb_strip_nulls) when the pair shares 0 or 1 groups, so the
    -- field only appears when there is a real "+N" to draw.
    'group_extra', CASE WHEN viewer_id IS NOT NULL
                        THEN NULLIF(GREATEST(public._shared_group_count(viewer_id, u.user_id) - 1, 0), 0)
                        ELSE NULL END
  ))
$function$;
