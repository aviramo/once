-- app_add: relax preconditions + add 1h rate limit.
--
-- Visibility/eligibility rules (per UX spec):
--   - Visible whenever A.page1.state ≠ 'chat' AND A.page2.profile is missing
--     AND A.page2.profiles is empty/missing.
--   - Clickable only when last add was > 1h ago (or never).
--
-- Server-side this means:
--   1. Drop the strict "page2.state must be free" precondition. Accept any
--      page2 shape where there's no active profile and no viewers, including
--      the page2.state='locked' resting state for fresh users / post-clear2 /
--      post-leave/logout/cron. The transaction transitions page2 to
--      {state: 'free', profiles: []} as part of the work, so the user becomes
--      discoverable in the same call.
--   2. Read/write data.last_add_at (ISO timestamp inside the jsonb data
--      column). Reject with 'rate_limited' if it's < 1h old. The timestamp
--      is updated even when no candidates are found, so an empty-pool press
--      still consumes the cooldown — otherwise a user in a sparse area
--      could hammer the button.

CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  cand_ids   uuid[];
  cand_dists int[];
  cand_id    uuid;
  cand_dist  int;
  cand_row   public.users;
  notify_arr jsonb := '[]'::jsonb;
  result_user json;
  i          int;
  last_add   timestamptz;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;
  IF COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    RETURN jsonb_build_object('error', 'already_has_viewers');
  END IF;

  last_add := NULLIF(me_row.data->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '1 hour' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
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

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id] || COALESCE(cand_ids, ARRAY[]::uuid[])
  ) x))
  ORDER BY user_id FOR UPDATE;

  -- Re-check under lock.
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;
  IF COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    RETURN jsonb_build_object('error', 'already_has_viewers');
  END IF;
  last_add := NULLIF(me_row.data->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '1 hour' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

  -- Update last_add_at on data; reset page2 to a clean discoverable state
  -- (state='free', no profile, no message, profiles=[]). Any prior page2
  -- fields are wiped — at this point we know profile/profiles were empty,
  -- so we're not destroying anything observable.
  UPDATE public.users
  SET data      = jsonb_set(COALESCE(data, '{}'::jsonb), '{last_add_at}', to_jsonb(now())),
      relations = jsonb_set(
        relations, '{page2}',
        jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
  WHERE user_id = me_id;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF cand_ids IS NULL OR array_length(cand_ids, 1) = 0 THEN
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
