-- ============================================================================
-- Push-presence gate — a user who does NOT actually receive push notifications
-- is treated like a geo-/group-gated user: unavailable to everyone.
--
-- WHY
--   The app requires presence. A user who cannot be notified literally cannot
--   respond to an invite/match, so matching anyone to them is wasted on both
--   sides. "people who don't get notifications => unavailable" (user, 2026-05-18).
--
-- WHAT WE CAN AND CANNOT KNOW (verified against live data, 2026-05-18)
--   Server-side alone we CANNOT reliably tell "does this user get pushes?":
--     * Expo returns ticket.status='ok' even when the OS has notifications
--       muted — a delivered-but-silent push looks identical to a real one.
--     * Bare "no push_token on the row" is NOT a usable signal: 40 of 45
--       located users (all active in the last 24h) carry no token in this
--       base (simulator/dev/seed sessions where getExpoPushTokenAsync yields
--       nothing). Gating on missing-token would brick ~90% of the base.
--   So push_blocked() fires ONLY on POSITIVE evidence of non-delivery:
--     1. the client explicitly reported OS permission = 'denied'
--        (relations.push.perm; written by start/focus/location — see the edge
--        handler. 'undetermined' is NOT blocked: not-yet-prompted, not denied).
--     2. Expo returned 'DeviceNotRegistered' for the user's token
--        (relations.push.dead=true; set by app_push_dead from the push
--        pipeline, cleared when a fresh token re-registers).
--   This is deliberately conservative: it starts at ~0 impact and tightens as
--   the perm-reporting mobile build rolls out and dead tokens are detected —
--   the staged Expand approach, never a base-wide outage.
--
-- BACKWARD COMPAT: purely additive server-side. push_blocked() reads only the
--   new relations.push key (absent => not blocked). Old mobile builds never
--   send notif_perm, so relations.push.perm stays absent and they are NOT
--   gated. user_availability()/others() keep their signatures (CREATE OR
--   REPLACE, no DROP, no dependent-RPC breakage). NOT breaking. The
--   cross-version behaviour note is recorded in BACKWARD_COMPAT.md.
-- ============================================================================

-- ── helper: is this user POSITIVELY known to not receive notifications? ──────
-- location is null => never blocked (onboarding / pre-permission; mirrors the
-- area_state(null) escape-hatch tier and keeps brand-new users discoverable
-- through setup). Only an explicit denied perm or a dead token blocks.
create or replace function public.push_blocked(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.user_id = uid
      and u.location is not null
      and (
        u.relations->'push'->>'perm' = 'denied'
        or (u.relations->'push'->>'dead')::boolean is true
      )
  )
$$;

-- ── single source of truth: effective availability ─────────────────────────
-- Precedence (allowlist_groups body verbatim + the push_blocked tier):
--   1. disabled-group block      — hard person-level kill switch (safety lever).
--   2. push_blocked              — NEW. Presence requirement. Cannot fire when
--                                  location is null, so it sits above the
--                                  null-loc escape hatch harmlessly and is a
--                                  true hard block for located users.
--   3. null location             — onboarding / pre-permission => available.
--   4. allowlist active          — approved => available (geo bypassed), else
--                                  unavailable.
--   5. otherwise                 — geo area_state (deployed behaviour).
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
    when public.push_blocked(uid)
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

-- ── app_push_dead: a token came back DeviceNotRegistered ─────────────────────
-- Clears the dead token, records relations.push.dead=true, and recomputes
-- relations.availability so the user drops out of every pool immediately
-- (Realtime delivers it; the per-minute resync is the safety net for the
-- reverse direction when they re-register). Fire-and-forget from the push
-- pipeline; returns the {user, notify} envelope for Tools.rpc logging. No
-- push queued (the user just lost notifications — an area-closed push is moot).
create or replace function public.app_push_dead(p_user_id uuid)
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
     set data = jsonb_set(coalesce(u.data, '{}'::jsonb), '{push_token}', 'null'::jsonb, true),
         relations = jsonb_set(
           coalesce(u.relations, '{}'::jsonb),
           '{push}',
           coalesce(u.relations->'push', '{}'::jsonb)
             || jsonb_build_object('dead', true, 'token', false, 'checked_at', now())
         )
   where u.user_id = p_user_id
   returning u.location into v_loc;

  if not found then
    return jsonb_build_object('user', null, 'notify', '[]'::jsonb);
  end if;

  update public.users u
     set relations = jsonb_set(u.relations, '{availability}', public.user_availability(p_user_id, v_loc))
   where u.user_id = p_user_id
   returning u.* into v_row;

  return jsonb_build_object('user', to_jsonb(v_row), 'notify', '[]'::jsonb);
end;
$$;

revoke execute on function public.app_push_dead(uuid) from anon, authenticated;

-- ── others(): exclude push-unreachable candidates ───────────────────────────
-- allowlist_groups body verbatim + ONE candidacy clause mirroring the
-- group_blocked / area_available shape. No-op (indexed-empty / cheap exists)
-- when nobody is push_blocked, so for a base with no positive non-delivery
-- evidence matching stays byte-identical. Signature unchanged => CREATE OR
-- REPLACE (no DROP, deps safe).
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
    -- like a geo-gated one (mirrors the area_available clause).
    AND (
      NOT only_available
      OR NOT public.group_blocked(other.user_id)
    )
    -- push gate: a candidate POSITIVELY known not to receive notifications
    -- (denied perm or dead token) is excluded exactly like a geo-gated one.
    -- No-op when nobody has non-delivery evidence.
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
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
