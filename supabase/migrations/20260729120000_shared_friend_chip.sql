-- 2026-07-29 — the mutual-friend chip, built exactly like the shared-group one.
--
-- A card already says "we are both in <group>". This adds the person-level
-- twin: "we both know <name>". Same three pieces as groups:
--   _shared_friend_json   the chip's payload, embedded by make_profile
--   app_shared_friends    the tapped chip's detail list (mirrors app_shared_groups)
--   ORDER BY name         ONE ordering, so the chip names row 1 of the popup
--
-- The payload is name + extra count and nothing else, exactly like the group
-- chip's. The label reads "חבר של <name>" / "חברה של <name>", a sentence about
-- the CARD'S SUBJECT, so the gender it inflects with is that subject's own
-- `is_male` — already in every profile. The friend's own gender is only needed
-- by the popup's title, which reads it off the rows app_shared_friends returns.
--
-- Additive only: three new keys inside make_profile's object and one new RPC.
-- Old mobile builds ignore unknown keys, so nothing to stage and no
-- BACKWARD_COMPAT.md entry.

-- ── The chip's payload ─────────────────────────────────────────────────────
-- Returns the keys make_profile merges in, already stripped: {} when the pair
-- shares nobody, so the caller can `||` it unconditionally. `friend_extra`
-- counts the mutual friends BEYOND the named one (2 shared -> 1), exactly like
-- group_extra, and is NULL (dropped) at 0 so the "+N" pill stays off.
CREATE OR REPLACE FUNCTION public._shared_friend_json(p_a uuid, p_b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH mutual AS (
    SELECT u.user_id, u.name
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

-- ── make_profile: merge the friend payload in ──────────────────────────────
-- Unchanged apart from the trailing `||`. Guarded on viewer_id like the group
-- fields: a profile built without a viewer (a slim viewer-list entry) has no
-- "shared with whom" to answer.
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
        ELSE NULL END,
    'group_name',  CASE WHEN viewer_id IS NOT NULL
                        THEN public._shared_group_name(viewer_id, u.user_id)
                        ELSE NULL END,
    'group_extra', CASE WHEN viewer_id IS NOT NULL
                        THEN NULLIF(GREATEST(public._shared_group_count(viewer_id, u.user_id) - 1, 0), 0)
                        ELSE NULL END
  ))
  || CASE WHEN viewer_id IS NOT NULL
          THEN public._shared_friend_json(viewer_id, u.user_id)
          ELSE '{}'::jsonb END
$function$;

-- ── The tapped chip's detail list ──────────────────────────────────────────
-- Same shape app_my_friends emits per friend (user_id / name / image /
-- profile), so the popup renders rows with the SAME primitives the friends
-- list does and a tapped row can open that person's page. Ordered by name, the
-- same ORDER BY _shared_friend_json picks its one name with, so the chip
-- always names the first row.
CREATE OR REPLACE FUNCTION public.app_shared_friends(me_id uuid, p_other uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('friends', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'user_id', u.user_id,
             'name',    u.name,
             'image',   u.data->'images'->0,
             'profile', public.make_profile(u, NULL::int, me_id)) ORDER BY u.name)
    FROM public.friend_links fa
    JOIN public.users u
      ON u.user_id = CASE WHEN fa.a = me_id THEN fa.b ELSE fa.a END
    WHERE (fa.a = me_id OR fa.b = me_id)
      AND u.user_id <> p_other
      AND EXISTS (
        SELECT 1 FROM public.friend_links fb
        WHERE (fb.a = p_other AND fb.b = u.user_id)
           OR (fb.b = p_other AND fb.a = u.user_id))
  ), '[]'::jsonb))
$function$;

GRANT EXECUTE ON FUNCTION public.app_shared_friends(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.app_shared_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;
