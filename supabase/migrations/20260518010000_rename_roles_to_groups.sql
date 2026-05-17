-- Full internal rename: roles → groups (product decision; the user-facing
-- term was already "Groups/קבוצות", now the DB + code match it).
--
--   table  public.roles            → public.groups
--   table  public.user_roles       → public.user_groups
--   column user_groups.role_id     → user_groups.group_id
--   fn     public.role_blocked     → public.group_blocked
--   fn     public.app_admin_reset(p_role_ids) → (p_group_ids)
--   json   admin_user_facet_counts: roles/roles_none → groups/groups_none
--   json   admin_dashboard_metrics: "roles" → "groups"
--   constraints / indexes renamed for consistency.
--
-- Every dependent function is recreated in the SAME migration (Postgres does
-- not track SQL-body fn→fn / fn→table deps, so a rename alone would leave them
-- pointing at gone names at runtime). RENAME preserves all data and the FK/PK
-- wiring, so this is non-destructive and atomic. The legacy free-form
-- users.data.role JSON string is intentionally NOT touched (separate dead
-- field, read by nothing).

-- ── tables / column / constraints / indexes ─────────────────────────────────
alter table public.roles      rename to groups;
alter table public.user_roles rename to user_groups;
alter table public.user_groups rename column role_id to group_id;

alter table public.groups      rename constraint roles_pkey       to groups_pkey;
alter table public.groups      rename constraint roles_name_key   to groups_name_key;
alter table public.user_groups rename constraint user_roles_pkey         to user_groups_pkey;
alter table public.user_groups rename constraint user_roles_user_id_fkey to user_groups_user_id_fkey;
alter table public.user_groups rename constraint user_roles_role_id_fkey to user_groups_group_id_fkey;

alter index if exists public.roles_pkey          rename to groups_pkey;
alter index if exists public.roles_name_key      rename to groups_name_key;
alter index if exists public.user_roles_pkey     rename to user_groups_pkey;
alter index if exists public.user_roles_role_idx rename to user_groups_group_idx;

-- ── group_blocked (replaces role_blocked) ───────────────────────────────────
create or replace function public.group_blocked(uid uuid)
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
      and not g.enabled
  )
$$;

-- ── user_availability now calls group_blocked ──────────────────────────────
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
    else public.area_state(loc)
  end
$$;

-- ── others(): role_blocked → group_blocked (rest verbatim, sig unchanged) ───
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
    AND (
      NOT only_available
      OR NOT public.group_blocked(other.user_id)
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

-- ── app_admin_reset(p_group_ids uuid[]) replaces (p_role_ids uuid[]) ────────
drop function if exists public.app_admin_reset(uuid[]);

create or replace function public.app_admin_reset(p_group_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  if p_group_ids is null or array_length(p_group_ids, 1) is null then
    return jsonb_build_object('users', 0);
  end if;

  delete from public.chat
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids))
      or other_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  delete from public.log
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  delete from public.restrictions
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids))
      or other_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location)
    )
  where u.user_id in (
    select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids)
  );
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset(uuid[]) from public, anon, authenticated;

-- ── admin_user_facet_counts: roles→groups, roles_none→groups_none ──────────
create or replace function public.admin_user_facet_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.users),
    'groups_none', (
      select count(*) from public.users u
      where not exists (
        select 1 from public.user_groups ug where ug.user_id = u.user_id
      )
    ),
    'p1', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page1'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page1'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'p2', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page2'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page2'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'groups', coalesce((
      select jsonb_object_agg(group_id::text, c)
      from (
        select ug.group_id, count(*) c
        from public.user_groups ug
        group by ug.group_id
      ) q
    ), '{}'::jsonb)
  )
$$;

revoke all on function public.admin_user_facet_counts() from public, anon, authenticated;

-- ── admin_dashboard_metrics: "roles" block → "groups" ──────────────────────
create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from public.users),
      'new_today', (select count(*) from public.users
        where (created_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'new_7d', (select count(*) from public.users
        where created_at > now() - interval '7 days'),
      'new_30d', (select count(*) from public.users
        where created_at > now() - interval '30 days'),
      'online_5m', (select count(*) from public.users
        where last_seen > now() - interval '5 minutes'),
      'active_today', (select count(*) from public.users
        where (last_seen at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'active_7d', (select count(*) from public.users
        where last_seen > now() - interval '7 days'),
      'active_30d', (select count(*) from public.users
        where last_seen > now() - interval '30 days'),
      'with_location', (select count(*) from public.users
        where location is not null)
    ),
    'engagement', jsonb_build_object(
      'chat', (select count(*) from public.users
        where relations->'page1'->>'state' = 'chat'),
      'waiting', (select count(*) from public.users
        where relations->'page1'->>'state' = 'waiting'),
      'watching', (select count(*) from public.users
        where relations->'page1'->>'state' = 'watching'),
      'pending', (select count(*) from public.users
        where relations->'page2'->>'state' = 'pending'),
      'broadcasting', (select count(*) from public.users
        where (relations->>'last_add_at') is not null
          and (relations->>'last_add_at')::timestamptz
              > now() - interval '30 minutes')
    ),
    'availability', jsonb_build_object(
      'available', (select count(*) from public.users
        where relations->'availability'->>'state' = 'available'),
      'unavailable', (select count(*) from public.users
        where relations->'availability'->>'state' = 'unavailable'),
      'not_yet', (select count(*) from public.users
        where relations->'availability'->>'state' = 'not_yet'),
      'unknown', (select count(*) from public.users
        where relations->'availability'->>'state' is null)
    ),
    'credits', jsonb_build_object(
      'balance_total', (select coalesce(sum(
          (relations->'credits'->>'balance')::int), 0)
        from public.users
        where relations->'credits'->>'balance' ~ '^[0-9]+$'),
      'held_total', (select coalesce(sum(
          (relations->'credits'->>'held')::int), 0)
        from public.users
        where relations->'credits'->>'held' ~ '^[0-9]+$'),
      'tier_free', (select count(*) from public.users
        where coalesce(relations->'credits'->>'tier', 'free') = 'free'),
      'tier_pro', (select count(*) from public.users
        where relations->'credits'->>'tier' = 'pro')
    ),
    'areas', jsonb_build_object(
      'total', (select count(*) from public.areas),
      'active', (select count(*) from public.areas where mode = 'active'),
      'scheduled', (select count(*) from public.areas
        where mode = 'scheduled'),
      'disabled', (select count(*) from public.areas
        where mode = 'disabled')
    ),
    'groups', jsonb_build_object(
      'total', (select count(*) from public.groups),
      'disabled', (select count(*) from public.groups
        where enabled = false),
      'gated_users', (select count(distinct ug.user_id)
        from public.user_groups ug
        join public.groups g on g.id = ug.group_id
        where g.enabled = false)
    ),
    'funnel_7d', jsonb_build_object(
      'signups', (select count(*) from public.users
        where created_at > now() - interval '7 days'),
      'invites', (select count(*) from public.log
        where key = 'invite' and status < 400
          and created_at > now() - interval '7 days'),
      'approves', (select count(*) from public.log
        where key = 'approve' and status < 400
          and created_at > now() - interval '7 days'),
      'messages', (select count(*) from public.chat
        where created_at > now() - interval '7 days'
          and coalesce(is_event, false) = false)
    )
  )
$$;

-- ── drop the now-unreferenced role_blocked ─────────────────────────────────
drop function if exists public.role_blocked(uuid);
