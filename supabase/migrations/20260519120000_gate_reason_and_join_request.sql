-- ============================================================================
-- Gate reason + join-request flow + null-location candidacy exclusion.
--
-- NOTE: written against the LIVE schema (group-membership gate:
--   user_availability = push_blocked? unavailable : loc null? available :
--   in_enabled_group? available : unavailable). The repo's allowlist_*/
--   area_state model is stale vs the live DB; do not reintroduce it here.
--
-- WHY
--   The mobile gate UI must show the right message/CTA per cause: a user not
--   in any enabled group should see a "request to join" CTA (and a "waiting
--   for approval" state once requested), distinct from push (no-notifications)
--   gating. The client only sees relations.availability, so user_availability
--   must surface WHY. Plus a permission-less user whose location was nulled
--   must truly leave the candidate pool.
--
-- WHAT (additive; user decisions 2026-05-19):
--   * user_availability() → {state, reason?, join_requested?}; state semantics
--     byte-identical to live (deployed app reads only .state). reason ∈
--     {push,group}; set only when state = unavailable.
--   * public.join_requested(uid) — true iff relations.join_request set.
--   * public.app_join_request(me_id) — records relations.join_request={at}
--     and recomputes relations.availability (join_requested flips live).
--   * others(): + `other.location IS NOT NULL` under only_available, so a
--     user with no location (permission denied / onboarding) is not a
--     candidate (Q2 = exclude). Rest of body = live verbatim.
--
-- BACKWARD COMPAT: additive only. New optional jsonb keys (old mobile ignores
--   reason/join_requested). New helper + RPC (old clients don't call).
--   others() signature unchanged. State semantics unchanged. Not breaking.
-- ============================================================================

create or replace function public.join_requested(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.user_id = uid
      and u.relations -> 'join_request' is not null
  )
$$;

-- Live precedence preserved exactly; only `reason`/`join_requested` added.
create or replace function public.user_availability(uid uuid, loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'push')
    when loc is null
      then jsonb_build_object('state', 'available')
    when public.in_enabled_group(uid)
      then jsonb_build_object('state', 'available')
    else jsonb_build_object('state', 'unavailable', 'reason', 'group')
         || case when public.join_requested(uid)
              then jsonb_build_object('join_requested', true)
              else '{}'::jsonb end
  end
$$;

-- User asks to be let into the app. Records relations.join_request and
-- recomputes relations.availability so join_requested flips immediately
-- (response + Realtime). Idempotent (a repeat press refreshes the ts).
create or replace function public.app_join_request(me_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc extensions.geography;
  v_row public.users;
begin
  update public.users u
     set relations = jsonb_set(
           coalesce(u.relations, '{}'::jsonb),
           '{join_request}',
           jsonb_build_object('at', now()),
           true
         )
   where u.user_id = me_id
   returning u.location into v_loc;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  update public.users u
     set relations = jsonb_set(u.relations, '{availability}', public.user_availability(me_id, v_loc))
   where u.user_id = me_id
   returning u.* into v_row;

  return jsonb_build_object('user', to_jsonb(v_row), 'notify', '[]'::jsonb);
end;
$$;

-- others(): LIVE body verbatim + ONE clause: a candidate with no location
-- (permission denied → location nulled, or onboarding) is excluded under
-- only_available (Q2). Mirrors the in_enabled_group / push_blocked clauses.
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
    -- presence: a candidate with no location (permission denied → location
    -- nulled, or still onboarding) can't be matched and must not be surfaced.
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    AND (
      NOT only_available
      OR public.in_enabled_group(other.user_id)
    )
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