-- Two more facts a person may state about himself: how tall he is, and whether
-- he smokes. They ride `users.data` as two INDEPENDENT top-level keys, because
-- either one may be absent on its own — the card's row draws whichever of them
-- exists, and nothing at all when neither does.
--
--   data.height  — integer CENTIMETRES, always. The client picks in whatever
--                  units its locale uses for distance (see lib/height.ts) and
--                  converts; the row stores one canonical number so the same
--                  profile reads correctly to a viewer on the other system.
--   data.smokes  — boolean. Absent = not answered, which is a third state and
--                  not a `false`.
--
-- Expand only: two new keys nobody's client is required to read, so the
-- published build is untouched and BACKWARD_COMPAT.md needs no entry.

CREATE OR REPLACE FUNCTION public.make_profile(u users, dist_m integer, viewer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
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
    -- Both stripped by jsonb_strip_nulls when the user has not answered. Note
    -- `smokes` is a BOOLEAN, so a legitimate `false` ("does not smoke") is not
    -- a null and survives the strip — which is the whole point of keeping the
    -- unanswered state as an absent key rather than as false.
    'height',      CASE WHEN jsonb_typeof(u.data->'height') = 'number'
                        THEN u.data->'height'
                        ELSE NULL END,
    'smokes',      CASE WHEN jsonb_typeof(u.data->'smokes') = 'boolean'
                        THEN u.data->'smokes'
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
  || CASE WHEN viewer_id IS NOT NULL
          THEN public._shared_group_json(viewer_id, u.user_id)
             || public._shared_friend_json(viewer_id, u.user_id)
          ELSE '{}'::jsonb END
$function$;

-- The save side: same shape as `bio` and `family` — a key present in the
-- payload with a value of the right type is written, a key present with
-- anything else (the client sends null) CLEARS it, and a key absent from the
-- payload leaves the row alone.
CREATE OR REPLACE FUNCTION public.app_save_profile(me_id uuid, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  IF payload ? 'height' THEN
    IF jsonb_typeof(payload->'height') = 'number' THEN
      new_data := jsonb_set(new_data, '{height}', to_jsonb(round((payload->>'height')::numeric)::int));
    ELSE
      new_data := new_data - 'height';
    END IF;
  END IF;

  IF payload ? 'smokes' THEN
    IF jsonb_typeof(payload->'smokes') = 'boolean' THEN
      new_data := jsonb_set(new_data, '{smokes}', payload->'smokes');
    ELSE
      new_data := new_data - 'smokes';
    END IF;
  END IF;

  UPDATE public.users SET data = new_data WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user);
END;
$function$;
