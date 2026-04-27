-- app_refresh_snapshots(me_id):
-- Propagates A's current last_seen + location into every snapshot of A
-- that lives inside other users' relations. Also recomputes distances
-- inside A's own relations against A's (possibly new) location.
--
-- Rules:
--   • Outward — for every B that references A:
--       state=chat   → update last_seen only; ensure distance is absent
--       state≠chat   → update last_seen and distance
--   • Inward — inside A.relations:
--       page1.profile state=chat → ensure distance is absent
--       page1.profile state≠chat → recompute distance against target
--       page2 object             → recompute distance against inviter
--       page2 array              → recompute distance for each viewer
--
-- Called from the edge handler behind EdgeRuntime.waitUntil after persist()
-- and the main RPC. Realtime carries the changes back to each affected user.

CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  me_row    public.users;
  other_row public.users;
  state_b   text;
  new_dist  int;
  target_id uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ── Outward 1: B.page1.profile.user_id = A ────────────────────────────────
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b := other_row.relations->'page1'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_build_object('last_seen', me_row.last_seen)
      ) WHERE user_id = other_row.user_id;
    ELSE
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
      ) WHERE user_id = other_row.user_id;
    END IF;
  END LOOP;

  -- ── Outward 2: B.page2 is object with user_id = A (incoming pending) ──────
  FOR other_row IN
    SELECT * FROM public.users
    WHERE jsonb_typeof(relations->'page2') = 'object'
      AND relations->'page2'->>'user_id' = me_id::text
  LOOP
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      ((relations->'page2') - 'distance')
      || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- ── Outward 3: B.page2 is array with element user_id = A ──────────────────
  FOR other_row IN
    SELECT * FROM public.users
    WHERE jsonb_typeof(relations->'page2') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(relations->'page2') e
        WHERE e->>'user_id' = me_id::text
      )
  LOOP
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN e->>'user_id' = me_id::text THEN
            (e - 'distance')
            || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
          ELSE e END
        )
        FROM jsonb_array_elements(relations->'page2') e
      ), '[]'::jsonb)
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- ── Inward A.page1.profile ────────────────────────────────────────────────
  IF me_row.relations ? 'page1' AND me_row.relations->'page1' ? 'profile' THEN
    target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page1'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        (relations->'page1'->'profile') - 'distance'
      ) WHERE user_id = me_id;
    ELSIF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('distance', new_dist))
      ) WHERE user_id = me_id;
    END IF;
  END IF;

  -- ── Inward A.page2 (object form) ──────────────────────────────────────────
  IF jsonb_typeof(me_row.relations->'page2') = 'object' THEN
    target_id := (me_row.relations->'page2'->>'user_id')::uuid;
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2}',
        ((relations->'page2') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('distance', new_dist))
      ) WHERE user_id = me_id;
    END IF;
  END IF;

  -- ── Inward A.page2 (array form) ───────────────────────────────────────────
  IF jsonb_typeof(me_row.relations->'page2') = 'array' THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      COALESCE((
        SELECT jsonb_agg(
          (e - 'distance')
          || jsonb_strip_nulls(jsonb_build_object('distance', (
            SELECT CASE
              WHEN me_row.location IS NULL OR u.location IS NULL THEN NULL
              ELSE extensions.st_distance(me_row.location::extensions.geography, u.location::extensions.geography)::int
            END
            FROM public.users u WHERE u.user_id = (e->>'user_id')::uuid
          )))
        )
        FROM jsonb_array_elements(relations->'page2') e
      ), '[]'::jsonb)
    ) WHERE user_id = me_id;
  END IF;
END;
$$;
