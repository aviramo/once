-- A SAVED PROFILE IS THE NEWEST THING ON THE ROW
--
-- Editing a value or a photo showed the change at once, then flashed the
-- PREVIOUS value for a beat, then came back to the new one. Nothing was wrong
-- with the save: what the user saw was the app being told the truth twice, in
-- the wrong order.
--
-- /app/profile writes the row TWICE, and it has to:
--   1. user.persist()      -> UPDATE users SET last_seen = T1, location = ...
--                             (this is the whole row as it stands, so `data`
--                             still holds the OLD bio / height / photos)
--   2. app_save_profile()  -> UPDATE users SET data = <the new profile>
-- Persist runs FIRST on purpose — it writes the same `data` COLUMN from a copy
-- read before the RPC ran, so in the other order the save was undone by the
-- update right behind it (see the note at `case "profile"` in app/index.ts).
--
-- Both writes fan out over Realtime, so the client is handed a row with the
-- OLD profile in it and then a row with the new one. That is fine while it can
-- TELL them apart — the store drops any payload whose `last_seen` is older than
-- the newest one it has already applied — but step 2 did not touch `last_seen`,
-- so the two events carried the SAME stamp and neither could be ordered against
-- the other. The only thing left holding the new value on screen was the
-- store's optimistic `pending` map, and the HTTP response (which lands ~150ms
-- after the request, well before Realtime's echo) clears it: the response says
-- the new value, `pending` is spent, and the stale echo arriving behind it
-- repaints the old one until the second echo puts it right.
--
-- So the save stamps the row too, and the two writes are strictly ordered
-- again: the stale echo is now older than the response the client already
-- applied, and the guard it was always meant to hit drops it.
--
-- GREATEST, not a bare now(): the persist's stamp comes from the edge runtime's
-- JS clock and this one from the database's, and a database clock a few tens of
-- milliseconds behind would otherwise stamp the SAVE as the older of the two —
-- which is the same bug with the events swapped, and a worse one, because then
-- it is the fresh value being dropped.

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

  -- The stamp is what says this write happened AFTER the persist behind it. At
  -- least a millisecond past whatever is on the row, whichever clock is ahead.
  UPDATE public.users
     SET data = new_data,
         last_seen = GREATEST(last_seen + interval '1 millisecond', now())
   WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user);
END;
$function$;
