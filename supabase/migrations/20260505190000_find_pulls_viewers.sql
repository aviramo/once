-- Extends app_find: in addition to picking the single primary candidate
-- (A.page1.profile = B), now also pulls up to 5 next-best candidates into
-- A.page2.profiles[] AS A's "viewers", by setting their page1.profile = A.
-- For each secondary that is currently free, fires a `candidate` push so
-- the user knows someone new appeared in their page1 without them having
-- searched.
--
-- Ordering: primary = top relevance; secondaries = ranks 2..6. Secondaries
-- are pulled only when state='free' and page2.state IN free/chat — we never
-- override an active interaction.

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
  cand_ids    uuid[];
  cand_dists  int[];
  cand_id     uuid;
  cand_dist   int;
  cand_row    public.users;
  notify_arr  jsonb := '[]'::jsonb;
  i           int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  -- Top 6 candidates (1 primary + up to 5 secondaries). Ordered by relevance.
  SELECT array_agg(o.user_id ORDER BY rn), array_agg(o.distance ORDER BY rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
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
  ) o
  WHERE rn <= 6;

  picked_id   := cand_ids[1];
  picked_dist := cand_dists[1];
  old_target  := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  -- Lock me, old_target, and every candidate (primary + secondaries).
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target] || COALESCE(cand_ids, ARRAY[]::uuid[])
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  IF cur_state NOT IN ('free', 'locked') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
  END IF;

  -- Detach from old target if any
  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL AND cur_state = 'free' THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  -- Re-validate primary picked
  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF COALESCE(picked_row.relations->'page1'->>'state', 'free') = 'chat'
       OR COALESCE(picked_row.relations->'page2'->>'state', 'free') IN ('locked', 'pending') THEN
      picked_id := NULL;
    END IF;
  END IF;

  -- Assign primary to A.page1
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

    -- Add A as a viewer of B (existing behavior)
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(me_row, picked_dist))
    ) WHERE user_id = picked_id
      AND relations->'page2'->>'state' = 'free';
  END IF;

  -- Pull up to 5 secondaries: their page1 = watching A, and they appear as
  -- A's viewers (A.page2.profiles[]). Each one gets a `candidate` push.
  -- Re-load me_row to capture the updated page1 (so secondaries' snapshot
  -- of A reflects the just-set state).
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF cand_ids IS NOT NULL AND array_length(cand_ids, 1) > 1 THEN
    FOR i IN 2..LEAST(array_length(cand_ids, 1), 6) LOOP
      cand_id   := cand_ids[i];
      cand_dist := cand_dists[i];
      SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
      -- Allow free OR locked (matches the primary's accepted set; locked is
      -- the default for fresh users + the post-clear resting state). Only
      -- block 'watching'/'waiting'/'chat' so we don't disrupt active flow.
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
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$$;
