-- WHERE THE PHONE IS ON ITS FIRST FIX DECIDES THE WORLD, AND NOTHING DECIDES
-- IT AGAIN (user directive 2026-08-13): an account whose first location is in
-- the Middle East is a production account; anywhere else is the review world,
-- which is where the store reviewers are.
--
-- The Middle East, for this purpose, is a lat/lng box -- 12N..42N, 25E..64E --
-- and it is tested as plain geometry rather than geography on purpose: a box is
-- exactly the shape intended, while a geography polygon's edges are geodesics
-- that bow away from the parallels. Israel sits well inside it.
--
-- It is stamped ONCE, at the first location a row ever carries, and recorded in
-- data.env_locked_at. An Israeli who travels keeps his world; a reviewer who
-- moves the simulator keeps his; every row that existed before this was stamped
-- by the previous migration in the state it was already in. The only way to
-- move an account afterwards is app_admin_set_env, deliberately.
--
-- An account with no location yet stays 'review' (the column default): unknown
-- fails towards the world that cannot reach an Israeli user.
CREATE OR REPLACE FUNCTION public._in_middle_east(p extensions.geography)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p IS NOT NULL
     AND extensions.ST_Covers(
           extensions.ST_MakeEnvelope(25, 12, 64, 42, 4326),
           p::extensions.geometry)
$$;
REVOKE ALL ON FUNCTION public._in_middle_east(extensions.geography) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._in_middle_east(extensions.geography) TO service_role;

-- One BEFORE trigger owns both halves: the first-fix decision, and is_test
-- following env for every reader that still asks the old question.
CREATE OR REPLACE FUNCTION public._users_env_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.location IS NOT NULL AND NOT (coalesce(NEW.data, '{}'::jsonb) ? 'env_locked_at') THEN
    NEW.env  := CASE WHEN public._in_middle_east(NEW.location) THEN 'il' ELSE 'review' END;
    NEW.data := coalesce(NEW.data, '{}'::jsonb)
                || jsonb_build_object('env_locked_at', to_jsonb(now()), 'env_from', 'gps');
  END IF;

  NEW.is_test := (NEW.env <> 'il');
  RETURN NEW;
END;
$$;
