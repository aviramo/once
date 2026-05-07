-- After logout, page2 is now {state: 'locked', message: 'logout'} so the
-- /app/start handler can distinguish a logout-locked user from a user who
-- explicitly chose lock2. On the next login (first /app/start, /location,
-- or /focus call), the start handler flips this specific marker back to
-- {state: 'free', profiles: []}; lock2 (locked + no message) stays locked
-- across re-logins.

CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row       public.users;
  page1_target uuid;
  page2_inviter uuid;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
  vid          uuid;
  msg          text := 'logout';
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  page1_target  := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF me_row.relations->'page2'->>'state' = 'pending' THEN
    page2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  END IF;

  lock_ids := ARRAY[me_id];
  IF page1_target  IS NOT NULL THEN lock_ids := lock_ids || page1_target;  END IF;
  IF page2_inviter IS NOT NULL THEN lock_ids := lock_ids || page2_inviter; END IF;
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'left'));
  END LOOP;

  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'cancelled-in'));
  END LOOP;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'locked'),
    'page2', jsonb_build_object('state', 'locked', 'message', 'logout')
  ) WHERE user_id = me_id;

  RETURN jsonb_build_object('notify', notify_list);
END;
$$;
