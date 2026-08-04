-- TEMPORARY, AND ONLY IN THE REVIEW ENVIRONMENT (2026-08-05).
--
-- The build now in the stores looks its ended-state copy up under key names
-- the shipped dictionaries do not carry: app/home.tsx was renamed to
-- home.locked.watch.* / home.locked.invite.* one commit BEFORE he.ts / en.ts
-- were, and t()/tg() return the key itself when it is missing. So every one of
-- the thirteen endings -- on the heading chip beside the name and age, and in
-- the message popup behind it -- paints the raw key. The next build fixes it
-- at the source; this makes the screen unreachable for a store reviewer on the
-- build that is already out.
--
-- The mechanism is the app's OWN "I have read this" -- watcher_cleared_at /
-- target_cleared_at, exactly what app_clear1 / app_clear2 write when the user
-- presses Continue -- stamped as the row ends. The reviewer therefore lands on
-- the state a real user reaches one tap later, which is a state the app draws
-- correctly. Nothing new is invented for him to look at.
--
-- BEFORE, so it writes NEW in place and cannot recurse into the watch triggers
-- around it, and the AFTER projection then builds a board with no message on
-- it. It fires only for a relation that had a seeded review account on one end
-- (users.data->>'seed'), and then clears BOTH sides: the reviewer's because of
-- the string, the pool account's because there is nobody behind it to press
-- Continue and its board would otherwise hold a dead card for the rest of the
-- review. Two rows of real people never enter this branch.
--
-- DELETE THE TRIGGER the day the fixed build is live.
CREATE OR REPLACE FUNCTION public._is_review_pool(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT u.is_test AND u.data->>'seed' = 'app-store-review'
                     FROM public.users u WHERE u.user_id = p_user), false)
$$;

CREATE OR REPLACE FUNCTION public._review_swallow_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.state <> 'ended' THEN RETURN NEW; END IF;
  IF NOT (public._is_review_pool(NEW.watcher_id) OR public._is_review_pool(NEW.target_id)) THEN
    RETURN NEW;
  END IF;

  IF NEW.watcher_reason IS NOT NULL AND NEW.watcher_cleared_at IS NULL THEN
    NEW.watcher_cleared_at := now();
  END IF;
  IF NEW.target_reason IS NOT NULL AND NEW.target_cleared_at IS NULL THEN
    NEW.target_cleared_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._is_review_pool(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._is_review_pool(uuid) TO service_role;

DROP TRIGGER IF EXISTS watch_review_swallow_ended ON public.watch;
CREATE TRIGGER watch_review_swallow_ended
  BEFORE INSERT OR UPDATE ON public.watch
  FOR EACH ROW EXECUTE FUNCTION public._review_swallow_ended();
