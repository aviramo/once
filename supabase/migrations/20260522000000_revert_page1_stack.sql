-- Revert the page1 candidate STACK + the lookahead it superseded.
--
-- User decision (2026-05-22): bring page1 back to the pre-stack single-profile
-- model. The stack feature shipped 2026-05-19 in two migrations
-- (20260519130000_app_find_lookahead, 20260519140000_page1_stack) along with
-- the mobile deck/PullPane-behind/RisingCard rewrite. The mobile revert is in
-- the same change set; this is the SQL half.
--
-- What this migration does:
--   1. Restore app_find          -> single SELECT LIMIT 1 pick (the
--                                   20260517140000_app_find_drop_page2_pending_guard body).
--   2. Restore app_ignore        -> add restriction + delegate to app_find
--                                   (the 20260429120000_state_machine_v3 body).
--   3. Restore _kick_page1_at    -> waiting→credit-refund branch only, no
--                                   silent-splice non-top branch (the
--                                   20260517210000_credits body).
--   4. Restore app_refresh_snapshots -> no page1.profiles[] handling
--                                   (the 20260512120000_strip_distance_lastseen_on_message body).
--   5. DROP app_skip(uuid, uuid) -> the per-skip RPC; the /app/skip edge
--                                   route is removed in the same change.
--   6. DROP _page1_pick(...)     -> the shared candidate ranking helper
--                                   added for the stack.
--
-- Authored from the pre-stack live bodies preserved in the older migration
-- files. The mobile client in the same change set reads only page1.profile
-- (no page1.profiles[]) and runIgnore calls invoke('app/ignore').

-- ── 1. app_find: restore single-pick body ────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
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
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  cur_p2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  SELECT o.user_id, o.distance INTO picked_id, picked_dist
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
  ORDER BY o.relevance DESC
  LIMIT 1;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, picked_id]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  -- lazily expire a stale incoming invite so it can't permanently block find
  IF COALESCE(me_row.relations->'page2'->>'state', 'free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  -- page1 self-guard only. NO page2 clause: page1 (find) is independent of
  -- page2 (incoming invites) per the two-board model. A live page2.pending
  -- stays untouched on its own board; find proceeds on page1 and simply will
  -- not pick the inviter (excluded from the candidate pool above).
  IF cur_state NOT IN ('free', 'locked', 'watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

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
$function$;

-- ── 2. app_ignore: restore add-restriction + delegate to app_find ────────
CREATE OR REPLACE FUNCTION public.app_ignore(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row    public.users;
  target_id uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NOT NULL THEN
    PERFORM public._add_restriction(me_id, target_id, 'ignore');
  END IF;
  RETURN public.app_find(me_id, true, 'ignore');
END;
$$;

-- ── 3. _kick_page1_at: restore waiting-refund only, no silent splice ─────
CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql AS $$
BEGIN
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
$$;

-- ── 4. app_refresh_snapshots: restore body without page1.profiles[] ──────
CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
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

  -- Outward 2: B.page2.profile.user_id = A (pending / locked / chat)
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

  -- Inward A.page1.profile (rebuild B's snapshot inside A.relations)
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

  -- Inward A.page2.profile (rebuild inviter/partner snapshot)
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

  -- Inward A.page2.profiles[] (rebuild every watcher's full snapshot)
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
$$;

-- ── 5. Drop the stack-only RPC + helper ──────────────────────────────────
DROP FUNCTION IF EXISTS public.app_skip(uuid, uuid);
DROP FUNCTION IF EXISTS public._page1_pick(public.users, uuid[], int);

-- ── 6. Strip any lingering page1.profiles[] from live rows ───────────────
-- After the new app_find/app_ignore commit, no fresh write produces
-- page1.profiles[] anymore, but watching users persisted under the stack
-- model still carry the array. Drop it everywhere; page1.profile (the
-- single mirror) is the source of truth from here on.
UPDATE public.users
SET relations = jsonb_set(relations, '{page1}', (relations->'page1') - 'profiles')
WHERE relations->'page1' ? 'profiles'
  AND user_id IS NOT NULL;
