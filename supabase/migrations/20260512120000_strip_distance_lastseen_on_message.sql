-- Profile snapshots stored inside users.relations should not expose
-- `distance` or `last_seen` once the page is in a locked-with-message
-- state. The "what happened" card has no use for those volatile fields,
-- and surfacing them after the interaction ended is misleading (e.g. a
-- partner's last_seen ticking forward after they left chat).
--
-- Existing rule (kept): state = 'chat' → strip `distance` from snapshot.
-- New rule:             message is set on the page → strip both
--                       `distance` and `last_seen` from snapshot.
--
-- Both rules apply additively. They affect the four snapshot slots that
-- can carry a message:
--   • outward B.page1.profile (B holding A's snapshot)
--   • outward B.page2.profile
--   • inward  A.page1.profile (A holding B's snapshot)
--   • inward  A.page2.profile
-- page2.profiles[] (watcher lists) are only populated when state='free',
-- so message never applies and those loops are unchanged.

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

  -- ── Outward 1: B.page1.profile.user_id = A ───────────────────────────────
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

  -- ── Outward 2: B.page2.profile.user_id = A (pending / locked / chat) ─────
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

  -- ── Outward 3: A appears inside B.page2.profiles[] (watcher list) ────────
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

  -- ── Inward A.page1.profile (rebuild B's snapshot inside A.relations) ─────
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

  -- ── Inward A.page2.profile (rebuild inviter/partner snapshot) ────────────
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

  -- ── Inward A.page2.profiles[] (rebuild every watcher's full snapshot) ────
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
