-- Regression fix: 20260505230000_app_add_endpoint accidentally undid the
-- 20260505210000_find_accept_watching fix. app_find must accept 'watching'
-- as a valid entry state (skip = ignore → app_find from watching) and must
-- detach the old target's profiles[] entry unconditionally — not only when
-- entering from 'free' — otherwise a watching → next transition leaves the
-- viewer entry behind on the old target.

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
  -- Allowed entry states: free/locked (idle re-pick) and watching (skip/ignore).
  -- waiting/chat are active interactions; never override.
  IF cur_state NOT IN ('free', 'locked', 'watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- Detach from old target unconditionally if one exists; the watching → next
  -- transition is the case that absolutely needs this cleanup.
  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL THEN
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
