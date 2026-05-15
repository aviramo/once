-- Broadcast UX update (2026-05-14):
--
--   1. Shortens the broadcast lifetime from 60 minutes to 30 minutes.
--      `app_add` now writes `last_add_at = now()` (unchanged) but its
--      rate-limit check rejects re-broadcasts only inside a 30-minute
--      window. The mobile client mirrors the new floor in
--      ADD_COOLDOWN_MS = 30 * 60 * 1000.
--
--   2. Adds `app_cancel_add(me_id)` — clears `relations.last_add_at` so
--      the user exits broadcast mode early. Used by the new
--      "Exit broadcast?" confirmation in the visibility toggle, and
--      also when the user explicitly taps the "Visible" segment while
--      broadcasting (page2 is already 'free' during broadcast, so
--      `app_free2` is a no-op there). Idempotent: a no-op when the
--      field is already absent.
--
--   3. Modifies `app_lock2` to also strip `last_add_at` from relations
--      in its UPDATE. When the user hides from discovery, the broadcast
--      cooldown is dropped in the same transaction so they don't keep
--      reading as "in broadcast mode" after they've already chosen to
--      hide. Old-client impact: hiding now ends the broadcast cooldown
--      early. This is a slight relaxation of the rate limit (users can
--      hide+re-show to bypass), but is intentional — broadcast is now
--      modelled as a user-controllable mode, not a hard rate limit.

-- 1. Shorten broadcast cooldown from 60m to 30m.
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
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

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
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

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

-- 2. app_cancel_add: clears last_add_at. Used by the toggle's
-- exit-broadcast popup and by tapping "Visible" while broadcasting.
CREATE OR REPLACE FUNCTION public.app_cancel_add(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users
  SET relations = relations - 'last_add_at'
  WHERE user_id = me_id
    AND relations ? 'last_add_at';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- 3. app_lock2: same as before, but also strip last_add_at when hiding.
CREATE OR REPLACE FUNCTION public.app_lock2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user  json;
  notify       jsonb := '[]'::jsonb;
  watcher_ids  uuid[] := '{}';
  watcher_id   uuid;
BEGIN
  SELECT COALESCE(
    (SELECT array_agg((p->>'user_id')::uuid)
     FROM jsonb_array_elements(COALESCE(u.relations->'page2'->'profiles', '[]'::jsonb)) AS p
     WHERE p->>'user_id' IS NOT NULL),
    '{}'::uuid[]
  )
  INTO watcher_ids
  FROM public.users u
  WHERE u.user_id = me_id AND u.relations->'page2'->>'state' = 'free';

  IF watcher_ids IS NULL THEN watcher_ids := '{}'; END IF;

  PERFORM 1 FROM public.users WHERE user_id = ANY(ARRAY[me_id] || watcher_ids) ORDER BY user_id FOR UPDATE;

  IF array_length(watcher_ids, 1) IS NOT NULL THEN
    FOREACH watcher_id IN ARRAY watcher_ids LOOP
      UPDATE public.users SET relations = jsonb_set(relations, '{page1}', public._page1_locked(relations->'page1'->'profile', 'remove'))
      WHERE user_id = watcher_id AND relations->'page1'->>'state' = 'watching' AND relations->'page1'->'profile'->>'user_id' = me_id::text;
      PERFORM public._add_restriction(me_id, watcher_id, 'remove');
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', watcher_id, 'code', 'removed'));
    END LOOP;
  END IF;

  -- Atomic: page2 → locked AND drop last_add_at.
  UPDATE public.users SET relations =
    jsonb_set(relations, '{page2}', public._page2_locked(NULL, NULL))
    - 'last_add_at'
  WHERE user_id = me_id AND relations->'page2'->>'state' = 'free';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;
