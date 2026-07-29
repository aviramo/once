-- 2026-07-29 — ONE "how are we connected" chip: my friends is a group like any
-- other (user directive 2026-07-29).
--
-- The card used to carry two chips, a shared GROUP and a mutual FRIEND, each
-- with its own "+N" and its own popup. They answer the same question, so they
-- are one chip now, and the friends set is ranked among the groups exactly as a
-- group is: THE SMALLEST CIRCLE WINS. The friends circle's size is how many
-- friends the VIEWER has ("if I have only 2 friends and Asaf is one of them,
-- and the other groups have more than 2 members, name Asaf").
--
-- The client applies that rule (one place: mobile/src/lib/communities.ts, which
-- also orders the popup with it), so all the server has to do is state the two
-- sizes it alone knows. Additive on the wire:
--   group_members   how many people are in the shared group it names
-- and one field is dropped before it was ever published:
--   friend_extra    the chip counts the friends CIRCLE once, not its members
--
-- `group_name` / `group_extra` are unchanged in name, meaning and value — the
-- published build still paints its group chip from them, so nothing is staged.
-- What changes is where they come from: one scan of the shared groups
-- (_shared_group_json) instead of two helper calls, which is what makes
-- `group_members` free.

-- ── The group half of the chip's payload ───────────────────────────────────
-- The same shape _shared_friend_json returns for the friend half: the keys
-- make_profile merges in, already stripped, {} when the pair shares no group.
-- ORDER BY members ASC, name ASC is the same tiebreak _shared_group_name has
-- carried since 2026-05-26 — the smallest shared group is the one that says
-- something about the two of you. `group_extra` counts the groups BEYOND the
-- named one and is NULL (dropped) at 0 so the "+N" pill stays off.
--
-- _shared_group_name / _shared_group_count stay exactly as they are: others()
-- uses the first as an existence test for the ×3 relevance boost, and paying
-- for a second scan there would buy nothing.
CREATE OR REPLACE FUNCTION public._shared_group_json(p_a uuid, p_b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH shared AS (
    SELECT g.name,
           (SELECT count(*)::int FROM public.user_groups m WHERE m.group_id = g.id) AS members
    FROM public.user_groups ug_a
    JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
    JOIN public.groups g ON g.id = ug_a.group_id
    WHERE ug_a.user_id = p_a
      AND ug_b.user_id = p_b
      AND NOT ug_a.hidden
      AND NOT ug_b.hidden
  ), top AS (
    SELECT s.name, s.members FROM shared s ORDER BY s.members ASC, s.name ASC LIMIT 1
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'group_name',    (SELECT t.name FROM top t),
    'group_members', (SELECT t.members FROM top t),
    'group_extra',   NULLIF(GREATEST((SELECT count(*)::int FROM shared) - 1, 0), 0)
  ))
$function$;

GRANT EXECUTE ON FUNCTION public._shared_group_json(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public._shared_group_json(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── The friend half ────────────────────────────────────────────────────────
-- Unchanged except that `friend_extra` is gone: the chip names the friends
-- CIRCLE, and a circle counts once however many people are in it — the popup is
-- where every mutual friend is listed. The name is still the alphabetically
-- first mutual friend, the same ORDER BY app_shared_friends lists them with, so
-- the chip always names row 1 of that popup.
CREATE OR REPLACE FUNCTION public._shared_friend_json(p_a uuid, p_b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'friend_name', (
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
      ORDER BY u.name
      LIMIT 1)
  ))
$function$;

-- ── make_profile: one merge per circle kind ────────────────────────────────
-- Identical to the previous body apart from the group keys moving out of the
-- object and into the same `||` the friend keys already ride.
CREATE OR REPLACE FUNCTION public.make_profile(u users, dist_m integer, viewer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'user_id',     u.user_id,
    'title',       u.name || ', ' || extract(year from age(now(), u.birth_date::timestamp with time zone))::text,
    'name',        u.name,
    'images',      COALESCE(u.data->'images', '[]'::jsonb),
    'bio',         CASE WHEN length(trim(coalesce(u.data->>'bio',''))) > 0
                        THEN u.data->>'bio'
                        ELSE NULL END,
    'family',      CASE WHEN jsonb_typeof(u.data->'family') = 'object'
                        THEN u.data->'family'
                        ELSE NULL END,
    'is_male',     u.is_male,
    'last_seen',   u.last_seen,
    'distance',    dist_m,
    'location_custom', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          OR (u.data->>'location_custom')::boolean = true
        THEN true
        ELSE NULL END,
    'location_type', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          THEN u.data->>'location_type'
        WHEN (u.data->>'location_type') IS NULL
          AND (u.data->>'location_custom')::boolean = true
          THEN 'home'
        ELSE NULL END
  ))
  || CASE WHEN viewer_id IS NOT NULL
          THEN public._shared_group_json(viewer_id, u.user_id)
             || public._shared_friend_json(viewer_id, u.user_id)
          ELSE '{}'::jsonb END
$function$;
