-- The App Store review environment is 103 seeded accounts (users.data->>'seed'
-- = 'app-store-review', every one of them is_test). They are rows, not phones:
-- nothing bumps their last_seen, and public.others() only offers somebody seen
-- within _presence_ttl() (1 day), so a day after the seed run the reviewer's
-- pool would be empty and the app would look broken.
--
-- So a cron ticks over them: every 5 minutes it takes a RANDOM handful whose
-- last_seen has gone stale and marks them seen a few minutes ago. Random, not
-- ordered, so "active now" moves around the pool the way a real one does, and
-- the seen-ago line on a card is never the same number for everybody.
--
-- Scoped by the seed marker AND by is_test: it can never touch a real user's
-- row, nor the developer's own Hebrew test accounts.
CREATE OR REPLACE FUNCTION public._review_pool_touch(p_limit int DEFAULT 15)
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
    WHERE u.is_test
      AND u.data->>'seed' = 'app-store-review'
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

REVOKE ALL ON FUNCTION public._review_pool_touch(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._review_pool_touch(int) TO service_role;

SELECT cron.schedule('review-pool-touch', '*/5 * * * *', $$SELECT public._review_pool_touch(15)$$);
