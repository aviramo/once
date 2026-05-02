-- Profile items: replace data.images + data.bio with a unified ordered data.items array.
-- Each item is one of:
--   { kind: 'photo', normal?: string, hash: string }
--   { kind: 'bio',   value: string }
--   { kind: 'kids',  value: boolean }
-- Array order = display order on the user's own profile.
-- is_for_kids top-level column is kept for server-side candidate matching and
-- is synced by app_save_items whenever a kids item is present.

-- ── make_profile ─────────────────────────────────────────────────────────────
-- Builds a Profile snapshot from a users row and a pre-computed distance.
-- Reads photos and bio from data.items (new format).
CREATE OR REPLACE FUNCTION public.make_profile(u public.users, dist_m int)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'user_id',     u.user_id,
    'title',       u.name || ', ' || extract(year from age(now(), u.birth_date::timestamp with time zone))::text,
    'name',        u.name,
    'images',      COALESCE(
                     (SELECT jsonb_agg(item - 'kind' ORDER BY ordinality)
                      FROM jsonb_array_elements(u.data->'items') WITH ORDINALITY AS t(item, ordinality)
                      WHERE item->>'kind' = 'photo'),
                     '[]'::jsonb
                   ),
    'bio',         (SELECT item->>'value'
                    FROM jsonb_array_elements(u.data->'items') item
                    WHERE item->>'kind' = 'bio'
                    LIMIT 1),
    'is_for_kids', u.is_for_kids,
    'is_male',     u.is_male,
    'last_seen',   u.last_seen,
    'distance',    dist_m
  ))
$$;

-- ── app_save_items ────────────────────────────────────────────────────────────
-- Saves the full ordered items array to data.items.
-- If a kids item is present, also syncs is_for_kids top-level column.
CREATE OR REPLACE FUNCTION public.app_save_items(me_id uuid, items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  kids_value boolean;
  result_user json;
BEGIN
  SELECT (item->>'value')::boolean INTO kids_value
  FROM jsonb_array_elements(items) item
  WHERE item->>'kind' = 'kids'
  LIMIT 1;

  UPDATE public.users
  SET
    data        = jsonb_set(COALESCE(data, '{}'::jsonb), '{items}', items),
    is_for_kids = CASE WHEN kids_value IS NOT NULL THEN kids_value ELSE is_for_kids END
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user);
END;
$$;

-- ── Backfill existing rows ────────────────────────────────────────────────────
-- Converts data.images + data.bio + is_for_kids → data.items.
-- Skips rows that already have data.items (idempotent).
UPDATE public.users
SET data = (
  (data - 'images' - 'bio')
  || jsonb_build_object(
    'items',
    COALESCE(
      (SELECT jsonb_agg(img || '{"kind":"photo"}'::jsonb)
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(data->'images') = 'array'
              THEN data->'images'
              ELSE '[]'::jsonb END
       ) img),
      '[]'::jsonb
    )
    || CASE WHEN data->>'bio' IS NOT NULL AND length(trim(data->>'bio')) > 0
            THEN jsonb_build_array(jsonb_build_object('kind', 'bio', 'value', data->>'bio'))
            ELSE '[]'::jsonb END
    || CASE WHEN is_for_kids IS NOT NULL
            THEN jsonb_build_array(jsonb_build_object('kind', 'kids', 'value', is_for_kids))
            ELSE '[]'::jsonb END
  )
)
WHERE data->'items' IS NULL;
