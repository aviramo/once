-- PRODUCTION IS ISRAEL, JORDAN AND LEBANON (user directive 2026-08-13),
-- narrowing the Middle East box of this morning: that one was 12N..42N by
-- 25E..64E, which put Tehran, Riyadh, Cairo, Istanbul, Rhodes and Ashgabat in
-- the same pool as the Israeli users the app is being marketed to.
--
-- Three rectangles, not one, and not a country dataset (the database carries no
-- borders table). One rectangle would have to reach 34.7N to hold northern
-- Lebanon and 39.3E to hold eastern Jordan, and everything in that corner --
-- Damascus first -- would come with it. So:
--
--   A  Israel + Jordan     29.18..33.40 N, 34.26..39.30 E
--   B  southern Lebanon    33.05..33.70 N, 35.10..36.10 E
--   C  northern Lebanon    33.70..34.70 N, 35.10..36.65 E
--
-- B and C are split at 33.70N precisely so Damascus (33.51N, 36.29E) falls
-- outside both: it is east of B's edge and south of C's. What the shape does
-- take in is border desert -- southern Syria under 33.40N, the north-west
-- Saudi corner, eastern Sinai -- which is the price of rectangles and is empty
-- ground.
--
-- Only NEW accounts are affected: an account's world is stamped at its first
-- GPS fix (data.env_locked_at) and nothing re-decides it.
CREATE OR REPLACE FUNCTION public._in_home_region(p extensions.geography)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p IS NOT NULL AND (
       extensions.ST_Covers(extensions.ST_MakeEnvelope(34.26, 29.18, 39.30, 33.40, 4326), p::extensions.geometry)
    OR extensions.ST_Covers(extensions.ST_MakeEnvelope(35.10, 33.05, 36.10, 33.70, 4326), p::extensions.geometry)
    OR extensions.ST_Covers(extensions.ST_MakeEnvelope(35.10, 33.70, 36.65, 34.70, 4326), p::extensions.geometry))
$$;
REVOKE ALL ON FUNCTION public._in_home_region(extensions.geography) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._in_home_region(extensions.geography) TO service_role;

CREATE OR REPLACE FUNCTION public._users_env_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.location IS NOT NULL AND NOT (coalesce(NEW.data, '{}'::jsonb) ? 'env_locked_at') THEN
    NEW.env  := CASE WHEN public._in_home_region(NEW.location) THEN 'il' ELSE 'review' END;
    NEW.data := coalesce(NEW.data, '{}'::jsonb)
                || jsonb_build_object('env_locked_at', to_jsonb(now()), 'env_from', 'gps');
  END IF;

  NEW.is_test := (NEW.env <> 'il');
  RETURN NEW;
END;
$$;

-- One definition of the home region, never two.
DROP FUNCTION IF EXISTS public._in_middle_east(extensions.geography);
