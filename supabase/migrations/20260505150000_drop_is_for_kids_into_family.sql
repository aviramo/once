-- Move is_for_kids preference from a top-level boolean column into
-- data.family.isForKids, then drop the column. All family-related state
-- (hasKids, kids[], schedule, isForKids) lives in one place.
--
-- Background: the previous flat_profile_fields migration restored an
-- app_save_profile RPC that wrote to is_for_kids, but the column had
-- already been removed by 20260503191221. Every save_profile call was
-- failing silently — family changes never persisted. The right fix is to
-- absorb the preference into the family blob, since the popup edits it
-- alongside hasKids/kids/schedule anyway.

-- 1. Backfill: merge non-null is_for_kids values into data.family.isForKids.
-- If data.family already exists, splice the field in. Otherwise create a
-- minimal family object with hasKids=false (true would be a lie when the
-- user never engaged with the family popup).
UPDATE public.users
SET data = CASE
  WHEN is_for_kids IS NULL THEN data
  WHEN jsonb_typeof(data->'family') = 'object' THEN
    jsonb_set(data, '{family,isForKids}', to_jsonb(is_for_kids))
  ELSE
    jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{family}',
      jsonb_build_object('hasKids', false, 'isForKids', is_for_kids)
    )
END
WHERE is_for_kids IS NOT NULL;

-- 2. Rewrite app_save_profile so it stops referencing the column. The client
-- now sends family with isForKids embedded; the RPC just stores data.family
-- as a blob.
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

  UPDATE public.users SET data = new_data WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user);
END;
$$;

-- 3. app_save_items still referenced is_for_kids and is unused by the new
-- client (which calls app_save_profile). Drop it.
DROP FUNCTION IF EXISTS public.app_save_items(uuid, jsonb);

-- 4. Drop the column.
ALTER TABLE public.users DROP COLUMN IF EXISTS is_for_kids;
