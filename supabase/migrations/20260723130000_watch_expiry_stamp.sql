-- Watching-state expiry anchor.
--
-- A drawn candidate (page1.state = 'watching') has, until now, no clock: the
-- profile sat on the home pane indefinitely. We want it to lapse after an hour
-- so the user drops back to the play button and must re-draw. The actual
-- server-side teardown (viewer-list cleanup, cron sweep) is deferred; this
-- change only STAMPS the anchor the mobile client reads to stop rendering a
-- lapsed watching card locally (no flash on re-entry, no network dependency).
-- app_find on the next play press already removes the user from the old
-- target's viewer list, so a manual re-draw reconciles both sides.
--
-- Purely additive: a field the current client ignores. Both deploy orders are
-- safe (old client ignores expires_at; new client treats a watching row with
-- no expires_at as never-lapsing until it is re-drawn).

-- Single source of truth for the watching TTL (mirrors the inline invite TTL
-- pattern, but centralized because it is written from two call sites).
create or replace function public._watch_ttl()
returns interval
language sql
immutable
as $function$ SELECT interval '1 hour'; $function$;

-- ── app_find ────────────────────────────────────────────────────────────────
-- Unchanged except the watching write now stamps expires_at. Re-drawing (skip,
-- fresh play) rewrites page1 wholesale, so every new candidate gets a fresh
-- hour; the invite transition (watching -> waiting) likewise rebuilds page1 and
-- replaces this with the invite's own 10-minute clock.
create or replace function public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row         public.users;
  old_target     uuid;
  picked_id      uuid;
  picked_dist    int;
  picked_row     public.users;
  result_user    json;
  cur_state      text;
  cur_p2_state   text;
  cur_p2_inviter uuid;
  cand_ids       uuid[];
  cand_dists     int[];
  la_row         public.users;
  lookahead_json jsonb := '[]'::jsonb;
  i              int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  cur_p2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
           OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
      AND (cur_p2_inviter IS NULL OR o.user_id <> cur_p2_inviter)
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' IN ('watching', 'waiting')
      )
  ) c
  WHERE c.rn <= 3;

  picked_id   := cand_ids[1];
  picked_dist := cand_dists[1];

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, picked_id]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF COALESCE(me_row.relations->'page2'->>'state', 'free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  IF cur_state NOT IN ('free', 'locked', 'watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', '[]'::jsonb);
  END IF;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF COALESCE(picked_row.relations->'page1'->>'state', 'free') = 'chat'
       OR NOT public._page2_open(picked_row.relations->'page2') THEN
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
        'profile', public.make_profile(picked_row, picked_dist, me_id),
        'expires_at', now() + public._watch_ttl()
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public._slim_viewer(public.make_profile(me_row, picked_dist)))
    ) WHERE user_id = picked_id
      AND public._page2_open(relations->'page2');
  END IF;

  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids, 1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead_json := lookahead_json || jsonb_build_array(public.make_profile(la_row, cand_dists[i], me_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', lookahead_json);
END;
$function$;

-- ── app_seed_viewer ─────────────────────────────────────────────────────────
-- Unchanged except the watching write now stamps expires_at. The seeded viewer
-- (cand_id) is the party whose page1 becomes 'watching', so this is the other
-- entry point that creates a watching card and it gets the same hour.
create or replace function public.app_seed_viewer(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  cur_p1     uuid;
  cand_id    uuid;
  cand_dist  int;
  cand_row   public.users;
  notify_arr jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF COALESCE(me_row.relations->'availability'->>'state', 'available') <> 'available'
     OR COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free'
     OR COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  cur_p1 := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  SELECT o.user_id, o.distance
  INTO cand_id, cand_dist
  FROM public.others(me_row, true) o
  JOIN public.users w ON w.user_id = o.user_id
  WHERE o.relevance > 0
    AND COALESCE(w.relations->'page1'->>'state', 'free') IN ('free', 'locked')
    AND (cur_p1 IS NULL OR o.user_id <> cur_p1)
  ORDER BY o.relevance DESC
  LIMIT 1;

  IF cand_id IS NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, cand_id]) x))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  cur_p1 := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  IF COALESCE(me_row.relations->'availability'->>'state', 'available') <> 'available'
     OR COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free'
     OR COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0
     OR (cur_p1 IS NOT NULL AND cur_p1 = cand_id) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
  IF NOT FOUND OR COALESCE(cand_row.relations->'page1'->>'state', 'free') NOT IN ('free', 'locked') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'watching',
      'profile', public.make_profile(me_row, cand_dist, cand_id),
      'expires_at', now() + public._watch_ttl()
    )
  ) WHERE user_id = cand_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(cand_row, cand_dist))
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'free';

  notify_arr := jsonb_build_array(
    jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text)
  );

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$function$;
