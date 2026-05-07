-- Flatten profile data: replace data.items with three top-level keys —
-- data.images (Image[]), data.bio (text), data.family (FamilyData object).
-- Display order in client UI is fixed (hero photo, bio+family attached, more
-- photos), so no ordered list is needed on the wire.
--
-- Migration steps:
--   1. Backfill data.{images,bio,family} from data.items, then drop data.items.
--   2. Rewrite make_profile to read the flat fields and embed family in the
--      Profile snapshot.
--   3. Drop app_save_items RPC; add app_save_profile(me_id, payload jsonb)
--      which updates only the keys present in payload.

-- ── 1. Backfill flat fields and drop data.items ──────────────────────────────
UPDATE public.users
SET data = (
  (data - 'items' - 'images' - 'bio' - 'family')
  || jsonb_build_object(
    'images',
    COALESCE(
      (SELECT jsonb_agg(item - 'kind' ORDER BY ordinality)
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(data->'items') = 'array' THEN data->'items' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS t(item, ordinality)
       WHERE item->>'kind' = 'photo'),
      '[]'::jsonb
    )
  )
  || COALESCE(
       (SELECT jsonb_build_object('bio', item->>'value')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(data->'items') = 'array' THEN data->'items' ELSE '[]'::jsonb END
             ) item
        WHERE item->>'kind' = 'bio' AND length(trim(coalesce(item->>'value',''))) > 0
        LIMIT 1),
       '{}'::jsonb
     )
  || COALESCE(
       (SELECT jsonb_build_object('family', item - 'kind')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(data->'items') = 'array' THEN data->'items' ELSE '[]'::jsonb END
             ) item
        WHERE item->>'kind' = 'family'
        LIMIT 1),
       '{}'::jsonb
     )
)
WHERE data IS NOT NULL;

-- ── 2. make_profile reads flat fields ────────────────────────────────────────
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
    'distance',    dist_m
  ))
$$;

-- ── 3. Replace app_save_items with app_save_profile ──────────────────────────
DROP FUNCTION IF EXISTS public.app_save_items(uuid, jsonb);

-- Updates whichever of {images, bio, family, is_for_kids} the payload provides.
-- Keys absent from the payload are left untouched. Pass jsonb 'null' (not SQL
-- NULL) on a key to clear that field — bio becomes empty, family becomes null.
CREATE OR REPLACE FUNCTION public.app_save_profile(me_id uuid, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  new_data    jsonb;
  result_user json;
BEGIN
  SELECT data INTO new_data FROM public.users WHERE user_id = me_id;
  IF new_data IS NULL THEN new_data := '{}'::jsonb; END IF;

  IF payload ? 'images' THEN
    IF jsonb_typeof(payload->'images') = 'array' THEN
      new_data := jsonb_set(new_data, '{images}', payload->'images');
    END IF;
  END IF;

  IF payload ? 'bio' THEN
    IF jsonb_typeof(payload->'bio') = 'string' AND length(trim(payload->>'bio')) > 0 THEN
      new_data := jsonb_set(new_data, '{bio}', to_jsonb(trim(payload->>'bio')));
    ELSE
      new_data := new_data - 'bio';
    END IF;
  END IF;

  IF payload ? 'family' THEN
    IF jsonb_typeof(payload->'family') = 'object' THEN
      new_data := jsonb_set(new_data, '{family}', payload->'family');
    ELSE
      new_data := new_data - 'family';
    END IF;
  END IF;

  UPDATE public.users
  SET
    data        = new_data,
    is_for_kids = CASE
                    WHEN payload ? 'is_for_kids' AND jsonb_typeof(payload->'is_for_kids') = 'boolean'
                      THEN (payload->>'is_for_kids')::boolean
                    ELSE is_for_kids
                  END
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user);
END;
$$;
