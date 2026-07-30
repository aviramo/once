-- 2026-07-30 — the chip's "+N" counts EVERY mutual friend as its own circle
-- (user directive 2026-07-30), reversing yesterday's "a circle counts once
-- however many people are in it".
--
-- The popup lists a row per mutual friend and a row per shared group, so a chip
-- that folded all the friends into a single circle said "+2" over a list of five
-- rows (2 shared groups + 3 mutual friends, reported 2026-07-30). One unit of
-- counting for both surfaces: the pill says how many MORE rows the popup holds.
--
-- Additive on the wire: `friend_extra` is a key nothing has ever read (it lived
-- for one unpublished day in 20260729120000 and was removed again in
-- 20260729140000), and it carries exactly the meaning `group_extra` carries —
-- how many beyond the one that is NAMED — so the chip counts its two halves
-- alike. Which circle is named is untouched: the smallest one still wins, and
-- the friends circle is still ranked at MY friend count (see sharedCircle).
CREATE OR REPLACE FUNCTION public._shared_friend_json(p_a uuid, p_b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- One scan, two facts off it — the same shape _shared_group_json uses for the
  -- group half. The name is still the alphabetically first mutual friend, the
  -- order app_shared_friends lists them in, so the chip always names row 1.
  WITH mutual AS (
    SELECT u.name
    FROM public.friend_links fa
    JOIN public.users u
      ON u.user_id = CASE WHEN fa.a = p_a THEN fa.b ELSE fa.a END
    WHERE (fa.a = p_a OR fa.b = p_a)
      -- The two sides of the card are frequently friends of each other; that
      -- is not a MUTUAL friend, it is the pair itself.
      AND u.user_id <> p_b
      AND EXISTS (
        SELECT 1 FROM public.friend_links fb
        WHERE (fb.a = p_b AND fb.b = u.user_id)
           OR (fb.b = p_b AND fb.a = u.user_id))
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'friend_name',  (SELECT m.name FROM mutual m ORDER BY m.name LIMIT 1),
    'friend_extra', NULLIF(GREATEST((SELECT count(*)::int FROM mutual) - 1, 0), 0)
  ))
$function$;

GRANT EXECUTE ON FUNCTION public._shared_friend_json(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public._shared_friend_json(uuid, uuid) FROM PUBLIC, anon, authenticated;
