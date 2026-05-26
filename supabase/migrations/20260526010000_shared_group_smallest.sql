-- _shared_group_name tiebreak: when a pair shares 2+ groups, prefer the
-- SMALLEST shared group (fewest members). A small community is a tighter
-- affinity signal than a large one (e.g., "neighbourhood book club" beats
-- "users from Tel Aviv"). Name kept as the deterministic secondary tiebreak
-- so the picked group is stable across calls.
--
-- The boost stays ×3 binary (one shared group is enough); only the chip's
-- displayed group name changes. Still a single chip; still NULL when no
-- shared group. make_profile / others / the 6 RPC callers untouched.

CREATE OR REPLACE FUNCTION public._shared_group_name(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT g.name
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  WHERE ug_a.user_id = p_a
    AND ug_b.user_id = p_b
  ORDER BY
    (SELECT COUNT(*) FROM public.user_groups m WHERE m.group_id = g.id) ASC,
    g.name ASC
  LIMIT 1
$$;
