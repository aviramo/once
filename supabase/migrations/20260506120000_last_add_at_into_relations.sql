-- Move `last_add_at` from `data.last_add_at` to `relations.last_add_at`.
--
-- Rationale: `last_add_at` is a 1h cooldown on the page2 "Show me to people"
-- button. It's tied to relations (it gates the app_add endpoint, which
-- mutates page2), but it must not sit *inside* page2 because page2 gets
-- wholesale-replaced by several RPCs (approve, expire_sweep, logout_cleanup,
-- delete_cleanup) — placing it inside would require every such RPC to
-- remember to preserve the timestamp. Top-level `relations.last_add_at`
-- gives co-location with the state machine without the merge-fragility risk.
--
-- This migration:
--   1. Backfills: for every users row where data.last_add_at exists, copy it
--      to relations.last_add_at, then strip it from data.
--   2. Replaces app_add to read/write relations.last_add_at.

-- 1. Backfill
UPDATE public.users
SET relations = jsonb_set(
      COALESCE(relations, '{}'::jsonb),
      '{last_add_at}',
      data->'last_add_at'
    ),
    data = data - 'last_add_at'
WHERE data ? 'last_add_at';

-- 2. Replace app_add
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

  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
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
  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '1 hour' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

  -- Update relations.last_add_at and reset page2 to a clean discoverable
  -- state (state='free', no profile, no message, profiles=[]). Any prior
  -- page2 fields are wiped — at this point we know profile/profiles were
  -- empty, so we're not destroying anything observable.
  UPDATE public.users
  SET relations = jsonb_set(
        jsonb_set(relations, '{last_add_at}', to_jsonb(now())),
        '{page2}',
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
