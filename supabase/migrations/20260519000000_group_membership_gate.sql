-- ============================================================================
-- Group-membership gate — supersedes the allowlist-flag model.
--
-- USER DECISION (2026-05-19): "delete the Approved group. Do it like this: if
-- a user is not in at least one ACTIVE group, then they are disabled."
--
-- So the allowlist *flag* (groups.allowlist + allowlist_active/group_allowed,
-- added 2026-05-18) is removed entirely and replaced by ONE rule expressed
-- through the plain enabled flag + membership:
--
--   public.in_enabled_group(uid) — true iff the user holds >=1 ENABLED group.
--
--   user_availability(uid, loc):
--     1. loc IS NULL                 -> available  (onboarding / pre-permission
--        escape hatch, unchanged: account + profile setup must work before the
--        user has any group / location, and so a store reviewer can sign up to
--        the point of being added to a group).
--     2. in_enabled_group(uid)       -> available  (member of an active group).
--     3. otherwise                   -> unavailable (no active group = off).
--
-- Consequences (intended):
--   * Every brand-new user is in NO group ⇒ unavailable until an admin adds
--     them to an active group. "Disabled until I enable them", with the group
--     panel as the single control.
--   * GEO IS NO LONGER A GATE. area_state/area_available are left defined but
--     are no longer consulted by user_availability or others() — membership
--     fully replaces location-based gating (the product direction: access is
--     managed from the panel, not by where the user is).
--   * group_blocked() is left defined (pre-existing) but unused: to block a
--     user you remove them from every active group (or disable their group);
--     a disabled group simply grants no access.
--
-- others(): rebuilt from the LIVE body. The area_available, group_blocked and
--   allowlist clauses are removed; ONE membership clause is added. The
--   push_blocked clause and the credits-affordability clause are PRESERVED
--   verbatim (push_blocked was added to others() after the allowlist
--   migration; it is unrelated and stays). Signature unchanged ⇒
--   CREATE OR REPLACE (no DROP, dependent RPCs untouched).
--
-- BACKWARD COMPAT: additive/neutral for the deployed app — mobile reads only
--   relations.availability.state, still one of available|unavailable|not_yet
--   (this model never emits not_yet; the client handles the two it does emit).
--   No client/global.ts change. NOT breaking.
-- ============================================================================

-- 1. membership helper
create or replace function public.in_enabled_group(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_groups ug
    join public.groups g on g.id = ug.group_id
    where ug.user_id = uid
      and g.enabled
  )
$$;

-- 2. single source of truth: membership (with the onboarding null-loc hatch)
create or replace function public.user_availability(uid uuid, loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when loc is null
      then jsonb_build_object('state', 'available')
    when public.in_enabled_group(uid)
      then jsonb_build_object('state', 'available')
    else jsonb_build_object('state', 'unavailable')
  end
$$;

-- 3. others(): membership replaces area_available + group_blocked + allowlist.
--    push_blocked + credits clauses preserved verbatim. Signature unchanged.
CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance double precision)
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
    END) relevance_broadcast
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
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
    AND NOT (
      jsonb_typeof((me).data->'family'->'isForKids') = 'boolean'
      AND jsonb_typeof(other.data->'family'->'isForKids') = 'boolean'
      AND ((me).data->'family'->>'isForKids')::bool IS DISTINCT FROM (other.data->'family'->>'isForKids')::bool
    )
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND COALESCE(other.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending')
      )
    )
    -- single gate: candidate must be in >=1 ENABLED group (replaces the old
    -- area_available + group_blocked + allowlist clauses). No-op shape
    -- mirrors the others; with the base seeded into groups, real users in an
    -- active group pass and everyone else is excluded.
    AND (
      NOT only_available
      OR public.in_enabled_group(other.user_id)
    )
    -- preserved verbatim (added to others() after the allowlist migration;
    -- unrelated to the gate model — keep).
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR COALESCE((other.relations->'credits'->>'balance')::numeric, 0) >= public._credits_cost('approve')
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
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast relevance
FROM relations
$function$;

-- 4. drop the now-superseded allowlist-flag mechanism (added 2026-05-18).
drop function if exists public.allowlist_active();
drop function if exists public.group_allowed(uuid);
drop index   if exists public.groups_allowlist_idx;
alter table public.groups drop column if exists allowlist;
