-- Watching-state teardown sweep (hourly cron).
--
-- The client already stops RENDERING a lapsed watching card locally (see the
-- expires_at stamp in 20260723130000 + the mobile useLapsed guard). This sweep
-- is the SERVER-side backstop: for a user who lets a draw lapse and never
-- returns, it flips their stale page1 'watching' to a bare 'locked' (the play
-- button, no message, no auto-find) and removes them from the drawn person's
-- viewer list so that person stops seeing a phantom watcher.
--
-- Deliberately mild, per the launch-night perf lesson:
--   * hourly (a 1h clock does not need a per-minute sweep),
--   * bounded per tick, oldest-first, capped flag logged,
--   * no push (a browsing user gets no "your draw expired" spam),
--   * NO re-seed here (the target picks up a fresh viewer on their own next
--     start/focus via app_seed_viewer) -- keeps the sweep cheap.
--
-- Safe for the live mobile build: 'watching' -> bare 'locked' is the exact
-- transition the match-kick already produces, which the shipped client renders
-- gracefully as the card sliding out to the play button.

-- ── _expire_watch_one ───────────────────────────────────────────────────────
-- Closes ONE lapsed watching card under a pair lock. Self-guarding: the write
-- re-checks state + expires_at + the target match under the lock, so it is a
-- no-op if the user already invited (page1 -> waiting), re-drew, was kicked, or
-- the clock was somehow not actually past. Idempotent under concurrent callers.
-- A NULL target (profile reference gone) still flips the state; the viewer-list
-- removal is simply skipped. Returns whether the state actually changed.
create or replace function public._expire_watch_one(p_watcher uuid, p_target uuid)
returns boolean
language plpgsql
as $function$
DECLARE
  did boolean := false;
BEGIN
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_watcher, p_target]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}', jsonb_build_object('state', 'locked')
  ) WHERE user_id = p_watcher
    AND relations->'page1'->>'state' = 'watching'
    AND (relations->'page1'->>'expires_at')::timestamptz <= now()
    AND (p_target IS NULL OR relations->'page1'->'profile'->>'user_id' = p_target::text);
  IF FOUND THEN did := true; END IF;

  IF did AND p_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(p_target, p_watcher);
  END IF;

  RETURN did;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._expire_watch_one(uuid, uuid) FROM anon, authenticated;

-- ── app_expire_watch_sweep ──────────────────────────────────────────────────
-- Scans lapsed watching rows oldest-first, bounded per tick, and closes each
-- via the pair-locked helper. Returns {processed, capped}; `capped` true means
-- the tick hit its row limit and the remainder is left for the next hour (never
-- silently dropped). No notify array -- the sweep never pushes.
create or replace function public.app_expire_watch_sweep()
returns jsonb
language plpgsql
as $function$
DECLARE
  row_rec   record;
  processed int := 0;
  seen      int := 0;
  cap       int := 2000;
BEGIN
  FOR row_rec IN
    SELECT user_id, NULLIF(relations->'page1'->'profile'->>'user_id', '')::uuid AS target_id
    FROM public.users
    WHERE relations->'page1'->>'state' = 'watching'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
    ORDER BY (relations->'page1'->>'expires_at')::timestamptz ASC
    LIMIT cap
  LOOP
    seen := seen + 1;
    IF public._expire_watch_one(row_rec.user_id, row_rec.target_id) THEN
      processed := processed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('processed', processed, 'capped', seen >= cap);
END;
$function$;
