-- ============================================================================
-- Roles model + role-disable folds into the geo-availability gate.
--
-- WHAT
--   * public.roles      — admin-managed role catalog (name, enabled flag).
--   * public.user_roles — many-to-many user<->role (a user may hold several;
--                         the admin UI is a checklist).
--   * public.role_blocked(uid)          — true iff the user holds >=1 DISABLED
--                                         role. language sql + stable so the
--                                         planner can inline it into others().
--   * public.user_availability(uid,loc) — SINGLE SOURCE OF TRUTH for a user's
--       effective availability: role-disabled => 'unavailable', else
--       area_state(loc). Every site that previously persisted
--       area_state(location) into relations.availability now calls this, so a
--       disabled role gates a user EXACTLY like being outside every active
--       area: same relations.availability.state='unavailable', same mobile
--       gate UI (geo-gate message + side-tab removal), same area-closed /
--       area-open push via app_area_resync, same exclusion from every other
--       user's match pool. No mobile change is needed.
--
-- WHY normalized tables (not data.role): the product needs a managed role
--   catalog (add / rename / delete-when-unused), several roles per user
--   (checklist), and a per-role enabled switch. The legacy single free-form
--   data.role string (only ever set to 'TEST' by the seed script, read by
--   nothing) is left untouched. Nothing depends on it, so this whole change is
--   purely additive and NOT breaking for the deployed app (which already
--   handles availability.state='unavailable').
--
-- others() CROSS-FEATURE NOTE: this re-creates public.others() from the live
--   (relevance_broadcast_boost) body, adding ONE candidacy clause
--   (NOT only_available OR NOT role_blocked(other)). The unapplied & uncommitted
--   credits.sql WIP also re-creates others(); whichever is applied later MUST
--   keep BOTH the credits-affordability clause AND this role clause. The
--   RETURNS TABLE signature is unchanged here, so CREATE OR REPLACE suffices
--   (no DROP, no dependent-RPC breakage).
-- ============================================================================

-- ── tables ──────────────────────────────────────────────────────────────────

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null unique,
  enabled     boolean not null default true
);

create table if not exists public.user_roles (
  user_id     uuid not null references public.users(user_id) on delete cascade,
  -- restrict (not cascade): a role that still has members cannot be dropped,
  -- so deleting a role can never silently strip assignments. The admin UI
  -- disables delete while the member count is > 0; this is the DB backstop.
  role_id     uuid not null references public.roles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

alter table public.roles      enable row level security;
alter table public.user_roles enable row level security;
-- No RLS policies on purpose (identical pattern to public.areas): only the
-- edge functions and the web admin touch these, both via the service-role key
-- (which bypasses RLS). anon / authenticated roles get zero access.

-- ── helpers ─────────────────────────────────────────────────────────────────

-- true iff the user currently holds at least one DISABLED role.
create or replace function public.role_blocked(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = uid
      and not r.enabled
  )
$$;

-- A user's EFFECTIVE availability. A disabled role forces 'unavailable'
-- regardless of location (it is a user-level block, not a place); otherwise
-- defer to the location-driven area_state. Brand-new users hold no roles, so
-- the null-location onboarding escape hatch inside area_state still applies.
create or replace function public.user_availability(uid uuid, loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.role_blocked(uid)
      then jsonb_build_object('state', 'unavailable')
    else public.area_state(loc)
  end
$$;

-- ── refactor every availability writer to the single source of truth ────────
-- (verbatim live bodies; the ONLY change is area_state(location) ->
--  user_availability(user_id, location).)

create or replace function public.app_availability(me_id uuid)
returns jsonb
language plpgsql
as $$
declare
  me_row public.users;
  av     jsonb;
  ru     json;
begin
  select * into me_row from public.users where user_id = me_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  av := public.user_availability(me_id, me_row.location::extensions.geography);

  update public.users
     set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', av)
   where user_id = me_id;

  select row_to_json(u) into ru from public.users u where u.user_id = me_id;
  return jsonb_build_object('user', ru, 'notify', '[]'::jsonb);
end;
$$;

create or replace function public.app_area_resync()
returns jsonb
language plpgsql
as $$
declare
  r       record;
  new_av  jsonb;
  new_st  text;
  old_st  text;
  notify  jsonb := '[]'::jsonb;
  cnt     int := 0;
begin
  for r in select user_id, location, relations from public.users loop
    new_av := public.user_availability(r.user_id, r.location::extensions.geography);
    new_st := new_av->>'state';
    old_st := r.relations->'availability'->>'state';

    if new_st is distinct from old_st then
      update public.users
         set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', new_av)
       where user_id = r.user_id;
      cnt := cnt + 1;

      if new_st = 'available' and old_st is not null and old_st <> 'available' then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-open'));
      elsif new_st = 'unavailable' and old_st = 'available' then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-closed'));
      end if;
    end if;
  end loop;

  return jsonb_build_object('processed', cnt, 'notify', notify);
end;
$$;

create or replace function public.app_area_launch_sweep()
returns jsonb
language plpgsql
as $$
declare
  r       record;
  new_av  jsonb;
  notify  jsonb := '[]'::jsonb;
  cnt     int := 0;
begin
  for r in
    select user_id, location
    from public.users
    where relations->'availability'->>'state' = 'not_yet'
  loop
    new_av := public.user_availability(r.user_id, r.location::extensions.geography);
    if (new_av->>'state') = 'available' then
      update public.users
         set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', new_av)
       where user_id = r.user_id
         and relations->'availability'->>'state' = 'not_yet';
      if found then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-open'));
        cnt := cnt + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('processed', cnt, 'notify', notify);
end;
$$;

create or replace function public.app_admin_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  delete from public.chat where user_id is not null;
  delete from public.log where user_id is not null;
  delete from public.restrictions where id is not null;

  update public.users set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(user_id, location)
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset() from public, anon, authenticated;

-- ── others(): also drop role-disabled users from everyone's pool ────────────
-- Live (relevance_broadcast_boost) body, verbatim, plus ONE candidacy clause.
-- Signature unchanged => CREATE OR REPLACE (no DROP). With zero disabled roles
-- role_blocked() is an indexed empty lookup, so matching stays byte-fast and,
-- for a base with no roles, byte-identical to before.
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
    -- ×2 while broadcasting (last_add_at inside the 30-min app_add window), else 1.0.
    -- NULLIF(...,'')::timestamptz is NULL when last_add_at is absent/empty, and
    -- NULL > now()-interval falls through to the ELSE 1.0 default.
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
    -- role gate: a candidate holding any DISABLED role is excluded exactly
    -- like a geo-gated one (mirrors the area_available clause above).
    AND (
      NOT only_available
      OR NOT public.role_blocked(other.user_id)
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
