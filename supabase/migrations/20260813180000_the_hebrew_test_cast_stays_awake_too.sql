-- THE TEST CAST IS ROWS, NOT PHONES, AND public.others() ONLY OFFERS SOMEBODY
-- SEEN WITHIN A DAY.
--
-- The dev world holds the Hebrew test cast: 38 accounts with photos, locations
-- around the developer, and nothing that ever opens the app. `others()` ends
-- with `other.last_seen > now() - _presence_ttl()` (1 day) - "around, not just
-- reachable" - so a day after they were seeded the whole cast falls out of the
-- pool at once and a developer account moved into dev is shown NOBODY, on a
-- board that is working perfectly.
--
-- That is exactly what happened on 2026-08-13: an account was moved to dev, its
-- own state was clean (both boards free, credits in the wallet, a location 300m
-- from the nearest cast member), 30 of the 38 were inside 50km, and the pool was
-- still empty because every one of them had last_seen 12.7 days old.
--
-- review-pool-touch already solves this for the App Store world and is scoped
-- to that seed marker, deliberately, so it could not help here. This is the same
-- job for the world beside it, and the two are the same shape on purpose: a
-- RANDOM stale handful every 5 minutes, marked seen a few minutes ago, so
-- "active now" moves around the cast the way it does in a real pool and the
-- seen-ago line on a card is never the same number for everybody.
--
-- Scoped to env = 'dev' and nothing else. It cannot reach a real user (that is
-- 'il'), nor the reviewers' pool ('review'), and it deliberately does not touch
-- an account that has a push token - a REAL phone in the dev world is the
-- developer's own device, and its last_seen is the truth about whether he has
-- the app open. Only the rows nobody is holding are woken.
--
-- UNLIKE the review job, this one is not temporary: the test cast is how the
-- game is exercised before a change reaches production, and a cast that goes
-- stale overnight makes every morning's first test look like a broken board.
CREATE OR REPLACE FUNCTION public._dev_pool_touch(p_limit int DEFAULT 15)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n int;
BEGIN
  WITH stale AS (
    SELECT u.user_id
    FROM public.users u
    WHERE u.env = 'dev'
      AND NOT (coalesce(u.data, '{}'::jsonb) ? 'push_token')
      AND u.last_seen < now() - interval '25 minutes'
    ORDER BY random()
    LIMIT p_limit
  )
  UPDATE public.users u
     SET last_seen = now() - (random() * interval '9 minutes')
    FROM stale s
   WHERE u.user_id = s.user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public._dev_pool_touch(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dev_pool_touch(int) TO service_role;

-- Unschedule first so the migration can be re-applied without stacking jobs.
SELECT cron.unschedule('dev-pool-touch')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dev-pool-touch');
SELECT cron.schedule('dev-pool-touch', '*/5 * * * *', $$SELECT public._dev_pool_touch(15)$$);
