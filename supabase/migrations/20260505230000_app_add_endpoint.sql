-- 1. Revert app_find to single-candidate behavior (no secondaries).
--    The "pull viewers into my page2" functionality moves to a dedicated
--    app_add endpoint, called from a new coral button shown on page2 only
--    when the user has zero viewers.
--
-- 2. Add app_add(me_id) — pulls up to 3 most-relevant candidates and
--    appends them to A.page2.profiles[] (each becomes a watcher of A,
--    fires a `candidate` push). Precondition: A.page2.state = 'free' AND
--    A.page2.profiles is empty/missing (so 3 is also a hard cap on the
--    array, since the button is the only path to grow it).

DROP FUNCTION IF EXISTS public.app_find(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row      public.users;
  old_target  uuid;
  picked_id   uuid;
  picked_dist int;
  picked_row  public.users;
  result_user json;
  cur_state   text;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  -- Top candidate by relevance.
  SELECT o.user_id, o.distance INTO picked_id, picked_dist
  FROM public.others(me_row, true) o
  WHERE o.relevance > 0
    AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
         OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
    AND NOT EXISTS (
      SELECT 1 FROM public.users w
      WHERE w.user_id = o.user_id
        AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
        AND w.relations->'page1'->>'state' = 'watching'
    )
  ORDER BY o.relevance DESC
  LIMIT 1;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, picked_id]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  IF cur_state NOT IN ('free', 'locked') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL AND cur_state = 'free' THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF COALESCE(picked_row.relations->'page1'->>'state', 'free') = 'chat'
       OR COALESCE(picked_row.relations->'page2'->>'state', 'free') IN ('locked', 'pending') THEN
      picked_id := NULL;
    END IF;
  END IF;

  IF picked_id IS NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'free')
    ) WHERE user_id = me_id;
  ELSE
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object(
        'state', 'watching',
        'profile', public.make_profile(picked_row, picked_dist)
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(me_row, picked_dist))
    ) WHERE user_id = picked_id
      AND relations->'page2'->>'state' = 'free';
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row      public.users;
  cand_ids    uuid[];
  cand_dists  int[];
  cand_id     uuid;
  cand_dist   int;
  cand_row    public.users;
  notify_arr  jsonb := '[]'::jsonb;
  result_user json;
  i           int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free' THEN
    RETURN jsonb_build_object('error', 'page2_not_free');
  END IF;
  IF COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    RETURN jsonb_build_object('error', 'already_has_viewers');
  END IF;

  -- Top 3 candidates by relevance, excluding anyone already watching me.
  SELECT array_agg(o.user_id ORDER BY rn), array_agg(o.distance ORDER BY rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' = 'watching'
      )
  ) o
  WHERE rn <= 3;

  IF cand_ids IS NULL OR array_length(cand_ids, 1) = 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
  END IF;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id] || cand_ids
  ) x))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free'
     OR COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
  END IF;

  FOR i IN 1..array_length(cand_ids, 1) LOOP
    cand_id   := cand_ids[i];
    cand_dist := cand_dists[i];
    SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
    IF COALESCE(cand_row.relations->'page1'->>'state', 'free') IN ('free', 'locked')
       AND COALESCE(cand_row.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending') THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1}',
        jsonb_build_object(
          'state', 'watching',
          'profile', public.make_profile(me_row, cand_dist)
        )
      ) WHERE user_id = cand_id;

      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profiles}',
        COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(cand_row, cand_dist))
      ) WHERE user_id = me_id
        AND relations->'page2'->>'state' = 'free';

      notify_arr := notify_arr || jsonb_build_array(jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text));
    END IF;
  END LOOP;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$$;
