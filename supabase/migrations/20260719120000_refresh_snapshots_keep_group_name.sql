-- app_refresh_snapshots was wiping Profile.group_name off every snapshot it
-- rebuilt.
--
-- make_profile's third argument, viewer_id, is what makes it embed the
-- shared-group name (via _shared_group_name). It defaults to NULL, and every
-- single-counterpart rewrite in this function called make_profile with two
-- arguments. app_find writes the chip correctly, then the app_refresh_snapshots
-- that runs behind the very next request overwrites the same slot without a
-- viewer and strips it. That is why the chip flashed and vanished, and why only
-- ACTIVE users lost it: an idle user's snapshot is never rebuilt.
--
-- The four single-counterpart call sites now pass the owner of the slot being
-- written: the outward loops rewrite A's snapshot inside B's relations, so the
-- viewer is B; the inward blocks rewrite B's snapshot inside A's, so it is A.
--
-- The two page2.profiles[] (viewer-list) rewrites are deliberately left at two
-- arguments. Viewer entries carry a reduced Profile and the chip is main-card
-- only, so adding a viewer there would put group_name somewhere nothing reads.
--
-- Additive and NOT breaking: this only adds an optional key to a JSONB
-- snapshot. Older mobile builds ignore unknown keys, and no response shape,
-- signature or precondition changes. No BACKWARD_COMPAT entry.

CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  other_row     public.users;
  state_b       text;
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
    state_b := other_row.relations->'page1'->>'state';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    -- viewer = B: this snapshot lives inside B's relations.
    fresh_profile := public.make_profile(me_row, new_dist, other_row.user_id);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
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
    state_b := other_row.relations->'page2'->>'state';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    -- viewer = B.
    fresh_profile := public.make_profile(me_row, new_dist, other_row.user_id);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
    END IF;
    UPDATE public.users
    SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
    WHERE user_id = other_row.user_id;
  END LOOP;

  -- Outward 3: A appears inside B.page2.profiles[] (watcher list).
  -- Two-arg on purpose: viewer-list entries are reduced and carry no chip.
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
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        -- viewer = A: this snapshot lives inside A's own relations.
        fresh_profile := public.make_profile(other_row, new_dist, me_id);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
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
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        -- viewer = A.
        fresh_profile := public.make_profile(other_row, new_dist, me_id);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
        END IF;
        UPDATE public.users
        SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
        WHERE user_id = me_id;
      END IF;
    END IF;
  END IF;

  -- Inward A.page2.profiles[] (rebuild every watcher's snapshot).
  -- Two-arg on purpose, same reason as Outward 3.
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
