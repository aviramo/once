-- Pause (the page1 skip-pause button) must NOT change visibility.
-- Previously app_pause locked BOTH pages: page2 -> {state:'locked'} hid the
-- user and the watcher_ids loop kicked everyone watching them. User request
-- 2026-05-22: pause stops the active page1 watch ONLY and leaves page2 /
-- visibility / broadcast / viewers completely untouched.
CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row       public.users;
  page1_state  text;
  page1_target uuid;
  result_user  json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  page1_state  := me_row.relations->'page1'->>'state';
  page1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  -- Pause is only meaningful from an active watch. Any other page1 state is a
  -- no-op (the pause button is only reachable while watching).
  IF page1_state <> 'watching' THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- Lock me + the watched user, ordered by user_id (deadlock-safe).
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(
    ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, page1_target]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- Detach me from the watched user's viewer list (I stopped watching them).
  -- This touches THEIR page2.profiles only; my own page2 is left alone.
  IF page1_target IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(
        (SELECT jsonb_agg(v)
         FROM jsonb_array_elements(relations->'page2'->'profiles') v
         WHERE v->>'user_id' <> me_id::text),
        '[]'::jsonb)
    ) WHERE user_id = page1_target
      AND relations->'page2'->>'state' = 'free'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
        WHERE e->>'user_id' = me_id::text);
  END IF;

  -- page1 -> locked (no message, no restriction). jsonb_set preserves page2,
  -- last_add_at, credits, availability, push, join_request verbatim, so
  -- visibility / broadcast / viewers are untouched.
  UPDATE public.users
  SET relations = jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked'))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$
