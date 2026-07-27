-- 2026-07-27 — "I manage it, I don't play in it": a per-membership hidden flag.
--
-- An owner/manager of a community can mark THEMSELVES hidden inside that group:
-- its members never meet them in the game and they never meet its members. The
-- flag is a property of the MEMBERSHIP (this person, in this group), not of the
-- group and not of the account — the same user stays fully visible everywhere
-- else, including in the other groups they are in.
--
-- Three surfaces change, all additive for installed apps:
--   others()            hard, symmetric exclusion of the pair (candidacy)
--   _shared_group_name  a hidden membership can never name the on-photo chip
--   _shared_group_count / app_shared_groups   same, for the chip's popup
-- Nothing is removed and no shape changes, so a published build is unaffected
-- except by the intended effect (fewer candidates). Only the new build can SET
-- the flag, so the column is dead weight until it ships.
--
-- Deliberately NOT hidden: the group's own surfaces. The roster (staff only)
-- still lists them, and group search still shows the owner beside the group.
-- Running a community publicly is the opposite of hiding — the flag is about
-- the game, not about the role.

ALTER TABLE public.user_groups
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_groups.hidden IS
  'This member asked not to meet the rest of this group in the game (set by owners/managers via app_set_group_hidden). Symmetric: they are excluded from each other''s candidate pool.';

-- ── The pair test ──────────────────────────────────────────────────────────
-- TRUE when a and b share a group in which either of them is hidden. One
-- definition, so candidacy and every "you're both in X" surface agree.
CREATE OR REPLACE FUNCTION public._group_hidden_pair(p_a uuid, p_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_groups ug_a
    JOIN public.user_groups ug_b
      ON ug_b.group_id = ug_a.group_id
     AND ug_b.user_id  = p_b
    WHERE ug_a.user_id = p_a
      AND (ug_a.hidden OR ug_b.hidden)
  )
$function$;

-- ── Shared-group surfaces: a hidden membership is not a shared group ───────
CREATE OR REPLACE FUNCTION public._shared_group_name(p_a uuid, p_b uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT g.name
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  WHERE ug_a.user_id = p_a
    AND ug_b.user_id = p_b
    AND NOT ug_a.hidden
    AND NOT ug_b.hidden
  ORDER BY
    (SELECT COUNT(*) FROM public.user_groups m WHERE m.group_id = g.id) ASC,
    g.name ASC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public._shared_group_count(p_a uuid, p_b uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COUNT(*)::int
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  WHERE ug_a.user_id = p_a
    AND ug_b.user_id = p_b
    AND NOT ug_a.hidden
    AND NOT ug_b.hidden
$function$;

CREATE OR REPLACE FUNCTION public.app_shared_groups(me_id uuid, p_other uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('groups', coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          g.id,
      'name',        g.name,
      'members',     cnt.n,
      'is_public',   g.is_public,
      'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
      'description', g.description,
      'owner',   CASE WHEN o.user_id IS NOT NULL
                      THEN jsonb_build_object(
                        'user_id', o.user_id,
                        'name',    o.name,
                        'image',   o.data->'images'->0
                      )
                      ELSE NULL END
    )
    ORDER BY cnt.n ASC, g.name ASC
  ), '[]'::jsonb))
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  LEFT JOIN public.users o ON o.user_id = g.owner_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n FROM public.user_groups m WHERE m.group_id = g.id
  ) cnt
  WHERE ug_a.user_id = me_id
    AND ug_b.user_id = p_other
    AND NOT ug_a.hidden
    AND NOT ug_b.hidden
$function$;

-- ── Candidacy ──────────────────────────────────────────────────────────────
-- Verbatim copy of the live body with ONE added clause (the hidden-pair
-- exclusion, beside the restrictions exclusion it reads like). Every other
-- candidacy clause and every relevance factor is preserved byte-for-byte per
-- CLAUDE.md's others() cross-feature note.
CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance_group double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH relations AS (
  SELECT
    other.user_id,
    row_to_json(other) "user",
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int AS distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dist_meters,
    other.range AS other_range,
    1::double precision relevance_gender,
    1::double precision relevance_restriction,
    (CASE WHEN (me).age_from = (me).age_to
      THEN CASE WHEN EXTRACT(year FROM age(other.birth_date)) = (me).age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age(other.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    END)
    *
    (CASE WHEN other.age_from = other.age_to
      THEN CASE WHEN EXTRACT(year FROM age((me).birth_date)) = other.age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age((me).birth_date)) - (other.age_from + other.age_to) / 2.0) / ((other.age_to - other.age_from) / 2.0))
    END) relevance_age,
    GREATEST(0.0, 1 - (EXTRACT(epoch FROM (now() - other.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) relevance_time,
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(other.relations->'page2'->'profiles'), 0)) / 5.0) relevance_watchers,
    public.schedule_overlap((me).data, other.data) relevance_schedule,
    public.kids_preference_match((me).data, other.data) relevance_kids,
    (CASE
      WHEN NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) relevance_broadcast,
    (CASE
      WHEN public._shared_group_name((me).user_id, other.user_id) IS NOT NULL
      THEN 3.0 ELSE 1.0
    END) relevance_group
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND other.is_test = COALESCE((me).is_test, false)
    AND (
      LEAST((me).range, other.range) IS NULL
      OR (me).location IS NULL
      OR other.location IS NULL
      OR extensions.st_dwithin(
        (me).location::extensions.geography,
        other.location::extensions.geography,
        LEAST((me).range, other.range)
      )
    )
    AND (
      ((me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_male) OR
      ((me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_male) OR
      (NOT (me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_female) OR
      (NOT (me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_female)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.restrictions r
      WHERE ((r.user_id = (me).user_id AND r.other_id = other.user_id)
          OR (r.other_id = (me).user_id AND r.user_id = other.user_id))
        AND ((r.key IN ('ignore', 'cancel', 'remove') AND r.created_at > now() - interval '1 day')
          OR (r.key = 'decline' AND r.created_at > now() - interval '7 days')
          OR (r.key = 'leave'   AND r.created_at > now() - interval '14 days')
          OR r.key = 'block')
    )
    -- A community you run is not a dating pool. When either side has hidden
    -- their membership in a group the two of them share, neither is ever
    -- offered the other. Symmetric by construction, so a manager who steps out
    -- of the game with their community steps out of it for both sides at once.
    AND NOT public._group_hidden_pair((me).user_id, other.user_id)
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND public._page2_open(other.relations->'page2')
      )
    )
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    AND (
      NOT only_available
      OR (
        jsonb_typeof(other.data->'images') = 'array'
        AND jsonb_array_length(other.data->'images') >= 1
      )
    )
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    -- Around, not just reachable: a full day without opening the app and you are
    -- no longer shown to anyone. Same family as push_blocked above — the app
    -- requires presence, and an invitation only means something to someone who
    -- is still here to answer it.
    AND (
      NOT only_available
      OR other.last_seen > now() - public._presence_ttl()
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR (COALESCE((other.relations->'credits'->>'balance')::numeric, 0)
        + COALESCE((other.relations->'credits'->>'extra')::numeric,   0))
        >= public._credits_cost('approve')
      OR (other.relations->'credits'->>'unpaid_at') IS NULL
    )
)
SELECT
  user_id,
  "user",
  distance,
  relevance_gender,
  relevance_restriction,
  relevance_age,
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END) relevance_location,
  relevance_time,
  relevance_watchers,
  relevance_schedule,
  relevance_kids,
  relevance_broadcast,
  relevance_group,
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast * relevance_group
  * (CASE WHEN EXISTS (
      SELECT 1 FROM public.friend_links fl
      WHERE fl.a = LEAST((me).user_id, user_id) AND fl.b = GREATEST((me).user_id, user_id)
    ) THEN 3.0 ELSE 1.0 END) relevance
FROM relations
$function$;

-- ── The managed-group row, defined once ────────────────────────────────────
-- app_owned_groups and _communities_summary painted the SAME row from two
-- hand-copied expressions, and they had already drifted: the summary counted
-- only status='pending' join requests while owned_groups counted every row,
-- so a declined request (which survives since 2026-07-27) inflated the badge
-- on one path and not the other. One definition now, and `hidden` — the
-- caller's own membership flag for that group — rides along with it.
CREATE OR REPLACE FUNCTION public._owned_group_json(uid uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
    'requires_approval', g.requires_approval, 'description', g.description,
    'is_owner', (g.owner_id = uid),
    'hidden', coalesce((SELECT ug.hidden FROM public.user_groups ug
                         WHERE ug.group_id = g.id AND ug.user_id = uid), false),
    'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
    'pending', (SELECT count(*) FROM public.group_join_requests jr
                 WHERE jr.group_id = g.id AND jr.status = 'pending')
  )
  FROM public.groups g
  WHERE g.id = p_group_id
$function$;

CREATE OR REPLACE FUNCTION public.app_owned_groups(me_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(jsonb_agg(public._owned_group_json(me_id, g.id)
                            ORDER BY (g.owner_id = me_id) DESC, g.created_at DESC), '[]'::jsonb)
  FROM public.groups g
  WHERE g.owner_id = me_id
     OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = me_id);
$function$;

CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'managed', coalesce((
      SELECT jsonb_agg(public._owned_group_json(uid, g.id)
                       ORDER BY (g.owner_id = uid) DESC, g.created_at DESC)
      FROM public.groups g
      WHERE g.owner_id = uid
         OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'joined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

-- ── The write ──────────────────────────────────────────────────────────────
-- Owner or manager only: the flag exists for the people who RUN a community,
-- and the manage page is the only surface that offers it. Idempotent — setting
-- what is already set answers with the same group row.
CREATE OR REPLACE FUNCTION public.app_set_group_hidden(me_id uuid, p_group_id uuid, p_hidden boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL AND NOT EXISTS(SELECT 1 FROM public.groups WHERE id = p_group_id) THEN
    RETURN jsonb_build_object('error', 'no_group');
  END IF;
  v_ok := (v_owner = me_id)
       OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;

  UPDATE public.user_groups
     SET hidden = p_hidden
   WHERE group_id = p_group_id AND user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  -- The flag rides in the denormalized summary, and the membership trigger only
  -- fires on INSERT/DELETE, so the refresh is explicit here.
  PERFORM public._refresh_communities(me_id);
  RETURN jsonb_build_object('group', public._owned_group_json(me_id, p_group_id));
END $function$;
