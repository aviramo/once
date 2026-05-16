-- Geo-availability gate.
--
-- Admin defines geographic "areas" (center + radius + start date). The app is
-- only fully usable for a user whose location falls inside an enabled area
-- whose start date has already passed. Two failure sub-states drive the
-- mobile gate UI: 'unavailable' (outside every enabled area) and 'not_yet'
-- (inside an area that hasn't opened yet).
--
-- Backward compatible: when NO enabled areas exist the gate is OFF and every
-- user is 'available' — identical to pre-feature behaviour. A null location
-- (onboarding / permission not yet granted) is also 'available' so the gate
-- never bricks a user we can't actually place.

create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       text not null,
  center      extensions.geography(Point, 4326) not null,
  radius_m    integer not null check (radius_m > 0),
  starts_at   timestamptz not null default now(),
  enabled     boolean not null default true
);

create index if not exists areas_center_gix on public.areas using gist (center);
create index if not exists areas_enabled_idx on public.areas (enabled) where enabled;

alter table public.areas enable row level security;
-- No RLS policies on purpose: only the edge function and the web admin touch
-- this table, both via the service-role key (which bypasses RLS). anon / auth
-- roles get zero access by default.

-- 3-way availability for a point. Returns {state} or {state, starts_at}.
create or replace function public.area_state(loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.areas where enabled)
      then jsonb_build_object('state', 'available')
    when loc is null
      then jsonb_build_object('state', 'available')
    when exists (
      select 1 from public.areas a
      where a.enabled
        and a.starts_at <= now()
        and extensions.st_dwithin(loc, a.center, a.radius_m)
    )
      then jsonb_build_object('state', 'available')
    when exists (
      select 1 from public.areas a
      where a.enabled
        and extensions.st_dwithin(loc, a.center, a.radius_m)
    )
      then jsonb_build_object(
        'state', 'not_yet',
        'starts_at', (
          select min(a.starts_at) from public.areas a
          where a.enabled
            and a.starts_at > now()
            and extensions.st_dwithin(loc, a.center, a.radius_m)
        )
      )
    else jsonb_build_object('state', 'unavailable')
  end
$$;

create or replace function public.area_available(loc extensions.geography)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.area_state(loc)->>'state') = 'available'
$$;

-- Recompute and persist me.relations.availability from my current location.
-- Returns the standard { user, notify } envelope so the edge handler can swap
-- it into the response (and Realtime carries the relations change to clients).
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

  av := public.area_state(me_row.location::extensions.geography);

  update public.users
     set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', av)
   where user_id = me_id;

  select row_to_json(u) into ru from public.users u where u.user_id = me_id;
  return jsonb_build_object('user', ru, 'notify', '[]'::jsonb);
end;
$$;

-- Re-create others() with one extra candidacy clause: when only_available is
-- requested (app_find always passes true), a geo-gated user is never a
-- candidate, so an in-region user is never matched against someone who can't
-- respond. With no enabled areas, area_available() is true for everyone, so
-- this clause is a no-op and matching is byte-identical to before.
CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance double precision)
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
    public.kids_preference_match((me).data, other.data) relevance_kids
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
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids relevance
FROM relations
$function$;
