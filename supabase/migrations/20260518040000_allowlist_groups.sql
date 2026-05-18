-- ============================================================================
-- Allowlist mode — admin-controlled per-person access via the existing Groups.
--
-- WHY
--   The app is going PUBLIC on the stores (no more TestFlight / Closed-testing
--   email lists). Anyone can download it, so access must be controlled 100%
--   server-side. The deployed gate is default-DENY by geo + a disabled-group
--   *denylist*. That denylist is the inverse of what's needed: to "let in only
--   the people I choose" we need an *allowlist*.
--
-- WHAT (reuses the existing Groups system + the entire deployed gate; ZERO
--       mobile change — exactly how the disabled-group gate already folds in):
--   * groups.allowlist           — a group flagged as an "approved" group.
--   * public.allowlist_active()  — true iff >=1 ENABLED group is flagged
--                                  allowlist. While true, the world is gated.
--   * public.group_allowed(uid)  — true iff the user holds >=1 ENABLED
--                                  allowlist group (i.e. is "approved").
--   * user_availability() folds allowlist in as the single source of truth:
--       - disabled-group block still wins (abuse lever, even over approved).
--       - null location => 'available' (onboarding escape hatch, unchanged).
--       - allowlist active & NOT approved => 'unavailable'.
--       - allowlist active & approved     => 'available' (bypasses geo, so an
--         approved store-reviewer / user is in regardless of where they are —
--         this is what makes App/Play review possible on a default-DENY app).
--       - allowlist NOT active            => geo area_state (unchanged).
--   * others() drops non-approved candidates from everyone's pool while
--     allowlist is active (mirrors the area_available / group_blocked clauses).
--
-- IMPLICIT TOGGLE (no separate settings table / no extra UI switch): allowlist
--   mode is simply "on" whenever at least one ENABLED group carries the
--   allowlist flag. Flag a group "Approved" + add people => gated launch.
--   Unflag / delete it => the world reverts to the geo gate. One concept, one
--   place, instantly reversible. Resync (web admin fire-and-forget + the
--   per-minute cron) already recomputes user_availability for everyone, so
--   flagging/unflagging or adding/removing members propagates immediately
--   (Realtime + area-open/area-closed push), both directions.
--
-- REGRESSION RESTORED HERE: the live others() (last recreated by
--   broadcast_free_approve) had LOST the disabled-group candidacy clause
--   (`NOT only_available OR NOT group_blocked(other)`) that
--   roles_model_and_availability had added — broadcast_free_approve rebased
--   others() off the credits body and dropped it, violating the CLAUDE.md
--   "others() CROSS-FEATURE NOTE". Since this migration recreates others()
--   anyway, the group_blocked clause is restored alongside the new allowlist
--   clause. Net: a disabled-group user is once again excluded from match
--   pools (they were still gated via relations.availability, but were
--   wrongly still surfaced as a candidate to others).
--
-- BACKWARD COMPAT: purely additive server-side. Mobile reads only
--   relations.availability.state ('available'|'unavailable'|'not_yet'), which
--   it already handles end-to-end; groups.allowlist is never read by the app;
--   others() signature is unchanged (CREATE OR REPLACE, no DROP, no dependent
--   RPC breakage). NOT breaking → no BACKWARD_COMPAT.md entry.
-- ============================================================================

-- ── schema: the approved-group flag ─────────────────────────────────────────
alter table public.groups
  add column if not exists allowlist boolean not null default false;

-- partial index: the allowlist_active()/group_allowed() lookups only ever care
-- about ENABLED allowlist groups, and there are very few of them.
create index if not exists groups_allowlist_idx
  on public.groups (id) where allowlist and enabled;

-- ── helpers ─────────────────────────────────────────────────────────────────

-- Allowlist mode is ON iff at least one ENABLED group is flagged allowlist.
-- A disabled allowlist group neither gates the world nor admits its members
-- (its members are group_blocked anyway), so it must not count here.
create or replace function public.allowlist_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.allowlist and g.enabled
  )
$$;

-- A user is "approved" iff they hold >=1 ENABLED allowlist group.
create or replace function public.group_allowed(uid uuid)
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
      and g.allowlist
      and g.enabled
  )
$$;

-- ── single source of truth: effective availability ─────────────────────────
-- Precedence is deliberate:
--   1. disabled-group block — a hard, person-level kill switch that overrides
--      everything, including approved membership (abuse/safety lever).
--   2. null location — onboarding / pre-permission. Always 'available' so the
--      onboarding & profile-setup flows work in every location/access state
--      (identical to the existing area_state(null) escape hatch).
--   3. allowlist active — approved => available (geo bypassed on purpose so a
--      hand-picked user / store reviewer is reachable anywhere), else
--      unavailable.
--   4. otherwise — the geo area_state (deployed behaviour, unchanged).
create or replace function public.user_availability(uid uuid, loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.group_blocked(uid)
      then jsonb_build_object('state', 'unavailable')
    when loc is null
      then jsonb_build_object('state', 'available')
    when public.allowlist_active()
      then case
        when public.group_allowed(uid)
          then jsonb_build_object('state', 'available')
        else jsonb_build_object('state', 'unavailable')
      end
    else public.area_state(loc)
  end
$$;

-- ── others(): exclude disabled-group AND (under allowlist) non-approved ──────
-- Live (broadcast_free_approve) body verbatim. TWO candidacy clauses added,
-- both mirroring the existing area_available clause's NOT-only_available shape:
--   * group_blocked  — RESTORED (regression, see header).
--   * allowlist      — when allowlist is active, only approved candidates
--                      remain; no-op (indexed empty lookup) when no group is
--                      flagged allowlist, so matching stays byte-fast and, for
--                      a base with no allowlist group, byte-identical to before.
-- Signature/return type unchanged → CREATE OR REPLACE (no DROP, deps safe).
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
    AND (
      NOT only_available
      OR public.area_available(other.location::extensions.geography)
    )
    -- group gate: a candidate holding any DISABLED group is excluded exactly
    -- like a geo-gated one (RESTORED; mirrors the area_available clause).
    AND (
      NOT only_available
      OR NOT public.group_blocked(other.user_id)
    )
    -- allowlist gate: while allowlist mode is active, only APPROVED candidates
    -- remain. No-op when no group is flagged allowlist.
    AND (
      NOT only_available
      OR NOT public.allowlist_active()
      OR public.group_allowed(other.user_id)
    )
    AND (
      NOT only_available
      -- A broadcasting user accepts for free → don't gate them on balance,
      -- or they'd vanish from the pool during their own paid broadcast.
      -- Same 30-minute window as relevance_broadcast above (keep in lockstep).
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
