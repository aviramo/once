-- page1 candidate STACK (Tinder/Bumble model).
--
-- relations.page1 gains `profiles: Profile[]` (the stack, only in state
-- 'watching', up to STACK_SIZE=10). EXPAND back-compat: while watching the
-- server ALSO writes `profile = profiles[0]` so the deployed app (which reads
-- page1.profile) keeps working unchanged. See BACKWARD_COMPAT.md.
--
-- Authored from the LIVE function bodies (pg_get_functiondef), not the stale
-- repo migration files. Supersedes 20260519130000_app_find_lookahead (the
-- lookahead envelope key is removed; the stack replaces it).
--
-- STACK_SIZE=10, REFILL_AT=3 are mirrored in mobile/src/tokens.ts
-- (STACK_SIZE / STACK_REFILL_AT) — keep in lockstep (same discipline as the
-- credits / 30-min broadcast constants).

-- ── shared candidate ranking ─────────────────────────────────────────────
-- The pending-inviter exclusion and the "users whose TOP is me" mirror
-- exclusion are intrinsic to picking, so they live here; the variable part
-- (the current stack / "what happened" id to skip) is passed as exclude_ids.
CREATE OR REPLACE FUNCTION public._page1_pick(me_row public.users, exclude_ids uuid[], lim int)
 RETURNS TABLE(uid uuid, dist int)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT c.user_id, c.distance
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND NOT (o.user_id = ANY (COALESCE(exclude_ids, ARRAY[]::uuid[])))
      AND ( (me_row.relations->'page2'->'profile'->>'user_id') IS NULL
            OR o.user_id <> (me_row.relations->'page2'->'profile'->>'user_id')::uuid )
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_row.user_id::text
          AND w.relations->'page1'->>'state' IN ('watching','waiting')
      )
  ) c
  WHERE c.rn <= lim
  ORDER BY c.rn
$function$;

-- ── app_find: fresh build OR background refill ───────────────────────────
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row       public.users;
  old_target   uuid;
  cur_state    text;
  result_user  json;
  excl         uuid[];
  cand_ids     uuid[];
  cand_dists   int[];
  new_profiles jsonb;
  top_row      public.users;
  cur_len      int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state','free');
  cur_len   := COALESCE(jsonb_array_length(me_row.relations->'page1'->'profiles'),0);

  -- ===== REFILL: watching with a non-empty stack (new-client top-up) =====
  -- Visible top + viewer registration stay untouched; just append fresh
  -- candidates (excluding the current stack) up to STACK_SIZE. Old clients
  -- never reach here (they skip via app_ignore -> app_skip).
  IF cur_state = 'watching' AND cur_len > 0 THEN
    IF cur_len >= 10 THEN
      SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
      RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
    END IF;
    PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
    cur_len := COALESCE(jsonb_array_length(me_row.relations->'page1'->'profiles'),0);
    IF cur_state <> COALESCE(me_row.relations->'page1'->>'state','free')
       OR cur_len = 0 OR cur_len >= 10 THEN
      SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
      RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
    END IF;
    SELECT array_agg((e->>'user_id')::uuid) INTO excl
    FROM jsonb_array_elements(me_row.relations->'page1'->'profiles') e;
    SELECT array_agg(uid ORDER BY ord), array_agg(dist ORDER BY ord)
    INTO cand_ids, cand_dists
    FROM (SELECT uid, dist, row_number() OVER () ord
          FROM public._page1_pick(me_row, excl, 10 - cur_len)) q;
    IF cand_ids IS NOT NULL THEN
      SELECT me_row.relations->'page1'->'profiles' ||
             COALESCE(jsonb_agg(public.make_profile(u, d.dist) ORDER BY d.ord), '[]'::jsonb)
      INTO new_profiles
      FROM unnest(cand_ids, cand_dists) WITH ORDINALITY AS d(uid,dist,ord)
      JOIN public.users u ON u.user_id = d.uid;
      UPDATE public.users SET relations = jsonb_set(
        jsonb_set(relations,'{page1,profiles}', new_profiles),
        '{page1,profile}', new_profiles->0
      ) WHERE user_id = me_id;
    END IF;
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  -- ===== FRESH: build a brand-new stack (initial / after a lock) =====
  -- pick on the UNLOCKED row first (mirrors the original app_find ordering),
  -- then lock me + old top + the new top.
  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  excl := CASE WHEN old_target IS NOT NULL THEN ARRAY[old_target] ELSE ARRAY[]::uuid[] END;
  SELECT array_agg(uid ORDER BY ord), array_agg(dist ORDER BY ord)
  INTO cand_ids, cand_dists
  FROM (SELECT uid, dist, row_number() OVER () ord
        FROM public._page1_pick(me_row, excl, 10)) q;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, (CASE WHEN cand_ids IS NOT NULL THEN cand_ids[1] END)]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  -- lazy-expire a stale incoming invite (unchanged from live)
  IF COALESCE(me_row.relations->'page2'->>'state','free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(relations,'{page2}',
      public._page2_locked(relations->'page2'->'profile','expire')) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state','free');
  IF cur_state NOT IN ('free','locked','watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  -- re-validate the would-be top under lock; drop stale heads so the next
  -- ranked candidate becomes the top (deeper entries are best-effort hints).
  WHILE cand_ids IS NOT NULL AND array_length(cand_ids,1) IS NOT NULL LOOP
    SELECT * INTO top_row FROM public.users WHERE user_id = cand_ids[1];
    EXIT WHEN FOUND
      AND COALESCE(top_row.relations->'page1'->>'state','free') <> 'chat'
      AND COALESCE(top_row.relations->'page2'->>'state','free') NOT IN ('locked','pending');
    cand_ids   := cand_ids[2:cardinality(cand_ids)];
    cand_dists := cand_dists[2:cardinality(cand_dists)];
  END LOOP;

  IF cand_ids IS NULL OR array_length(cand_ids,1) IS NULL THEN
    UPDATE public.users SET relations = jsonb_set(relations,'{page1}',
      jsonb_build_object('state','free')) WHERE user_id = me_id;
  ELSE
    SELECT COALESCE(jsonb_agg(public.make_profile(u, d.dist) ORDER BY d.ord),'[]'::jsonb)
    INTO new_profiles
    FROM unnest(cand_ids, cand_dists) WITH ORDINALITY AS d(uid,dist,ord)
    JOIN public.users u ON u.user_id = d.uid;

    UPDATE public.users SET relations = jsonb_set(relations,'{page1}',
      jsonb_build_object('state','watching','profiles',new_profiles,'profile',new_profiles->0)
    ) WHERE user_id = me_id;

    -- register me as a viewer on the TOP only (idempotent)
    UPDATE public.users SET relations = jsonb_set(relations,'{page2,profiles}',
      COALESCE(relations->'page2'->'profiles','[]'::jsonb)
        || jsonb_build_array(public.make_profile(me_row, cand_dists[1]))
    ) WHERE user_id = cand_ids[1]
      AND relations->'page2'->>'state' = 'free'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
            COALESCE(relations->'page2'->'profiles','[]'::jsonb)) e
          WHERE e->>'user_id' = me_id::text);
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
END;
$function$;

-- ── app_skip: the per-skip advance (new client) ──────────────────────────
-- Idempotent. Restrict the skipped, splice it out of the stack, move the
-- viewer registration to the new top, refill when low. Old clients reach the
-- same logic via app_ignore.
CREATE OR REPLACE FUNCTION public.app_skip(me_id uuid, skipped_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row       public.users;
  result_user  json;
  cur_state    text;
  profiles     jsonb;
  new_top      uuid;
  new_top_dist int;
  excl         uuid[];
  cand_ids     uuid[];
  cand_dists   int[];
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state','free');
  -- Only meaningful while watching a stack. If state changed underneath (e.g.
  -- the top matched elsewhere -> locked), no-op: realtime shows the client
  -- the authoritative state (the "what happened" card).
  IF cur_state <> 'watching' OR skipped_id IS NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  -- prospective new top from the UNLOCKED row (first stack entry that isn't
  -- the skipped one) so it can join the single sorted lock acquisition
  -- (deadlock-safe, mirrors app_find). The post-lock recompute below is
  -- authoritative; this only widens the lock set for the common case.
  SELECT (e->>'user_id')::uuid INTO new_top
  FROM jsonb_array_elements(me_row.relations->'page1'->'profiles') WITH ORDINALITY AS t(e,ord)
  WHERE e->>'user_id' <> skipped_id::text
  ORDER BY ord LIMIT 1;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, skipped_id, new_top]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  cur_state := COALESCE(me_row.relations->'page1'->>'state','free');
  IF cur_state <> 'watching' THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  -- 24h ignore on the skipped (same as today's skip; Tinder-style suppress)
  PERFORM public._add_restriction(me_id, skipped_id, 'ignore');
  -- de-register me from the skipped person's viewer list
  PERFORM public._remove_from_profiles(skipped_id, me_id);

  -- splice skipped out of my stack (idempotent if already gone)
  SELECT COALESCE((SELECT jsonb_agg(e ORDER BY ord)
                   FROM jsonb_array_elements(me_row.relations->'page1'->'profiles')
                        WITH ORDINALITY AS t(e,ord)
                   WHERE e->>'user_id' <> skipped_id::text), '[]'::jsonb)
  INTO profiles;

  -- Top the stack back up to STACK_SIZE on EVERY skip (user decision): the
  -- per-skip call already happens, so reuse it to append the new tail card.
  -- Normally that's exactly +1 (one skipped off the front, one appended) so
  -- the stack stays at 10 forever and no separate "near the end" refill call
  -- is ever needed. Also self-heals shrinkage from silent kick-splices
  -- (appends however many are missing in the same call).
  IF jsonb_array_length(profiles) < 10 THEN
    SELECT array_agg((e->>'user_id')::uuid) INTO excl
    FROM jsonb_array_elements(profiles) e;
    excl := COALESCE(excl, ARRAY[]::uuid[]) || skipped_id;
    SELECT array_agg(uid ORDER BY ord), array_agg(dist ORDER BY ord)
    INTO cand_ids, cand_dists
    FROM (SELECT uid, dist, row_number() OVER () ord
          FROM public._page1_pick(me_row, excl, 10 - jsonb_array_length(profiles))) q;
    IF cand_ids IS NOT NULL THEN
      SELECT profiles ||
             COALESCE(jsonb_agg(public.make_profile(u, d.dist) ORDER BY d.ord),'[]'::jsonb)
      INTO profiles
      FROM unnest(cand_ids, cand_dists) WITH ORDINALITY AS d(uid,dist,ord)
      JOIN public.users u ON u.user_id = d.uid;
    END IF;
  END IF;

  IF jsonb_array_length(profiles) = 0 THEN
    -- nothing left and nothing to refill -> empty pane (same as no-candidate)
    UPDATE public.users SET relations = jsonb_set(relations,'{page1}',
      jsonb_build_object('state','free')) WHERE user_id = me_id;
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  new_top      := (profiles->0->>'user_id')::uuid;
  new_top_dist := NULLIF(profiles->0->>'distance','')::int;

  UPDATE public.users SET relations = jsonb_set(relations,'{page1}',
    jsonb_build_object('state','watching','profiles',profiles,'profile',profiles->0)
  ) WHERE user_id = me_id;

  -- register me as a viewer on the NEW top only (idempotent)
  IF new_top IS NOT NULL AND new_top <> skipped_id THEN
    UPDATE public.users SET relations = jsonb_set(relations,'{page2,profiles}',
      COALESCE(relations->'page2'->'profiles','[]'::jsonb)
        || jsonb_build_array(public.make_profile(me_row, new_top_dist))
    ) WHERE user_id = new_top
      AND relations->'page2'->>'state' = 'free'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
            COALESCE(relations->'page2'->'profiles','[]'::jsonb)) e
          WHERE e->>'user_id' = me_id::text);
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
END;
$function$;

-- ── app_ignore: old-client skip == app_skip(current top) ─────────────────
CREATE OR REPLACE FUNCTION public.app_ignore(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row    public.users;
  target_id uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL
     OR COALESCE(me_row.relations->'page1'->>'state','free') <> 'watching' THEN
    -- nothing being watched -> behave like a fresh find
    RETURN public.app_find(me_id, true, 'ignore');
  END IF;
  RETURN public.app_skip(me_id, target_id);
END;
$function$;

-- ── _kick_page1_at: first-vs-rest stack rule ─────────────────────────────
-- target is X's TOP (profiles[0]/profile mirror) -> lock as today (the
-- "what happened" card; the stack is discarded since _page1_locked returns a
-- clean {state,profile,message}). target buried deeper in X's stack -> splice
-- it out silently, keep state. Only the locked (top) users are RETURNED so
-- only they get a push; the silent splice is invisible.
CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- non-top: silently remove target from X.page1.profiles[], rebuild the
  -- profile mirror = new profiles[0], leave state untouched. No notify.
  UPDATE public.users u
  SET relations = jsonb_set(
    jsonb_set(
      relations, '{page1,profiles}',
      COALESCE((SELECT jsonb_agg(e ORDER BY ord)
                FROM jsonb_array_elements(relations->'page1'->'profiles')
                     WITH ORDINALITY AS t(e,ord)
                WHERE e->>'user_id' <> target_id::text), '[]'::jsonb)
    ),
    '{page1,profile}',
    COALESCE((SELECT e FROM jsonb_array_elements(relations->'page1'->'profiles')
                     WITH ORDINALITY AS t(e,ord)
              WHERE e->>'user_id' <> target_id::text ORDER BY ord LIMIT 1),
             'null'::jsonb)
  )
  WHERE COALESCE(relations->'page1'->>'state','') = 'watching'
    AND relations->'page1'->'profile'->>'user_id' <> target_id::text
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(
          COALESCE(relations->'page1'->'profiles','[]'::jsonb)) e
        WHERE e->>'user_id' = target_id::text)
    AND (exclude_id IS NULL OR u.user_id <> exclude_id);

  -- top (or single-profile / waiting): unchanged behavior. _page1_locked
  -- returns {state:'locked',profile,message} -> the stack is discarded.
  RETURN QUERY
  UPDATE public.users u
  SET relations = CASE
    WHEN relations->'page1'->>'state' = 'waiting'
      THEN public._credits_refund(jsonb_set(relations, '{page1}',
             public._page1_locked(relations->'page1'->'profile', msg)))
    ELSE jsonb_set(relations, '{page1}',
           public._page1_locked(relations->'page1'->'profile', msg))
  END
  WHERE relations->'page1'->'profile'->>'user_id' = target_id::text
    AND COALESCE(relations->'page1'->>'state', '') <> 'locked'
    AND (exclude_id IS NULL OR u.user_id <> exclude_id)
  RETURNING u.user_id;
END;
$function$;

-- ── app_refresh_snapshots: also refresh the page1 stack ──────────────────
-- Live body verbatim PLUS two new blocks: Outward (B has A inside
-- B.page1.profiles[]) and Inward (A.page1.profiles[]). watching never carries
-- message/chat so no distance/last_seen stripping applies to stack entries.
-- The profile mirror is rebuilt = profiles[0] after each stack refresh.
CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  other_row     public.users;
  state_b       text;
  message_b     text;
  new_dist      int;
  fresh_profile jsonb;
  target_id     uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Outward 1: B.page1.profile.user_id = A
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b   := other_row.relations->'page1'->>'state';
    message_b := other_row.relations->'page1'->>'message';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
    END IF;
    IF message_b IS NOT NULL THEN
      fresh_profile := fresh_profile - 'distance' - 'last_seen';
    END IF;
    UPDATE public.users
    SET relations = jsonb_set(relations, '{page1,profile}', fresh_profile)
    WHERE user_id = other_row.user_id;
  END LOOP;

  -- Outward 1b: A appears inside B.page1.profiles[] (the stack). Refresh
  -- every matching entry; keep profile mirror = profiles[0].
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page1'->>'state' = 'watching'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(relations->'page1'->'profiles') e
                  WHERE e->>'user_id' = me_id::text)
  LOOP
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist);
    UPDATE public.users SET relations = (
      WITH np AS (
        SELECT COALESCE(jsonb_agg(
                 CASE WHEN e->>'user_id' = me_id::text THEN fresh_profile ELSE e END
                 ORDER BY ord), '[]'::jsonb) arr
        FROM jsonb_array_elements(relations->'page1'->'profiles') WITH ORDINALITY AS t(e,ord)
      )
      SELECT jsonb_set(jsonb_set(relations,'{page1,profiles}', np.arr),
                       '{page1,profile}', np.arr->0)
      FROM np
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- Outward 2: B.page2.profile.user_id = A
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page2'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b   := other_row.relations->'page2'->>'state';
    message_b := other_row.relations->'page2'->>'message';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
    END IF;
    IF message_b IS NOT NULL THEN
      fresh_profile := fresh_profile - 'distance' - 'last_seen';
    END IF;
    UPDATE public.users
    SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
    WHERE user_id = other_row.user_id;
  END LOOP;

  -- Outward 3: A appears inside B.page2.profiles[] (watcher list)
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page2'->>'state' = 'free'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
        WHERE e->>'user_id' = me_id::text
      )
  LOOP
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist);
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN e->>'user_id' = me_id::text THEN fresh_profile ELSE e END
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- Inward A.page1.profile
  IF me_row.relations->'page1' ? 'profile' THEN
    target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page1'->>'state';
    message_b := me_row.relations->'page1'->>'message';
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        fresh_profile := public.make_profile(other_row, new_dist);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
        END IF;
        IF message_b IS NOT NULL THEN
          fresh_profile := fresh_profile - 'distance' - 'last_seen';
        END IF;
        UPDATE public.users
        SET relations = jsonb_set(relations, '{page1,profile}', fresh_profile)
        WHERE user_id = me_id;
      END IF;
    END IF;
  END IF;

  -- Inward A.page1.profiles[] (the stack). Rebuild every entry from its
  -- current row; keep profile mirror = profiles[0]. (watching => no strip.)
  IF COALESCE(me_row.relations->'page1'->>'state','') = 'watching'
     AND jsonb_array_length(me_row.relations->'page1'->'profiles') > 0 THEN
    UPDATE public.users SET relations = (
      WITH np AS (
        SELECT COALESCE(jsonb_agg(
          COALESCE(
            (SELECT public.make_profile(u, CASE
                WHEN me_row.location IS NULL OR u.location IS NULL THEN NULL
                ELSE extensions.st_distance(me_row.location::extensions.geography, u.location::extensions.geography)::int
              END)
             FROM public.users u WHERE u.user_id = (e->>'user_id')::uuid),
            e
          ) ORDER BY ord), '[]'::jsonb) arr
        FROM jsonb_array_elements(relations->'page1'->'profiles') WITH ORDINALITY AS t(e,ord)
      )
      SELECT jsonb_set(jsonb_set(relations,'{page1,profiles}', np.arr),
                       '{page1,profile}', np.arr->0)
      FROM np
    ) WHERE user_id = me_id;
  END IF;

  -- Inward A.page2.profile
  IF me_row.relations->'page2' ? 'profile' THEN
    target_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page2'->>'state';
    message_b := me_row.relations->'page2'->>'message';
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        fresh_profile := public.make_profile(other_row, new_dist);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
        END IF;
        IF message_b IS NOT NULL THEN
          fresh_profile := fresh_profile - 'distance' - 'last_seen';
        END IF;
        UPDATE public.users
        SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
        WHERE user_id = me_id;
      END IF;
    END IF;
  END IF;

  -- Inward A.page2.profiles[]
  IF me_row.relations->'page2' ? 'profiles'
     AND jsonb_array_length(me_row.relations->'page2'->'profiles') > 0 THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          COALESCE(
            (SELECT public.make_profile(u, CASE
                WHEN me_row.location IS NULL OR u.location IS NULL THEN NULL
                ELSE extensions.st_distance(me_row.location::extensions.geography, u.location::extensions.geography)::int
              END)
             FROM public.users u WHERE u.user_id = (e->>'user_id')::uuid),
            e
          )
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = me_id;
  END IF;
END;
$function$;
