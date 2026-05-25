-- 2026-05-25 — Groups are now purely organisational. The "disable a group"
-- concept is removed entirely: groups.enabled column dropped, the
-- in_enabled_group / group_blocked helpers dropped, user_availability
-- collapses to push-gate only, others() drops the group candidacy clause,
-- and admin_dashboard_metrics / admin_user_facet_counts drop the
-- group-disable / role_gated counts. app_redeem_invite no longer filters
-- by enabled (every existing group is joinable).
--
-- Not breaking for the deployed mobile app: the only mobile-visible state
-- is relations.availability.state, which strictly widens (anyone who was
-- 'unavailable, reason=group' becomes 'available'); the old client already
-- handles 'available' as the default happy path.

-- ============================================================
-- 1. Rebuild user_availability — only push_blocked gates now.
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_availability(uid uuid, loc geography)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'push')
    else
      jsonb_build_object('state', 'available')
  end
$$;

-- ============================================================
-- 2. Rebuild others() — drop the in_enabled_group candidacy clause.
-- ============================================================
DROP FUNCTION IF EXISTS public.others(public.users, boolean);

CREATE OR REPLACE FUNCTION public.others(me public.users, only_available boolean DEFAULT false)
RETURNS TABLE(
  user_id uuid,
  "user" json,
  distance integer,
  relevance_gender double precision,
  relevance_restriction double precision,
  relevance_age double precision,
  relevance_location double precision,
  relevance_time double precision,
  relevance_watchers double precision,
  relevance_schedule double precision,
  relevance_kids double precision,
  relevance_broadcast double precision,
  relevance double precision
)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
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
      OR other.location IS NOT NULL
    )
    -- group-membership gate REMOVED: groups are purely organisational now
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
$$;

-- ============================================================
-- 3. app_redeem_invite — drop the enabled filter.
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_group_id  uuid;
  result_user json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id INTO v_group_id FROM public.groups WHERE invite_code = p_code;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  INSERT INTO public.user_groups(user_id, group_id) VALUES (me_id, v_group_id)
    ON CONFLICT (user_id, group_id) DO NOTHING;

  UPDATE public.users
     SET relations = jsonb_set(
           relations,
           '{availability}',
           public.user_availability(user_id, location)
         )
   WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ============================================================
-- 4. Drop the now-unused helpers + the column.
-- ============================================================
DROP FUNCTION IF EXISTS public.in_enabled_group(uuid);
DROP FUNCTION IF EXISTS public.group_blocked(uuid);

ALTER TABLE public.groups DROP COLUMN IF EXISTS enabled;

-- ============================================================
-- 5. Rebuild the admin dashboard + facet RPCs without the dropped counts.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  select jsonb_build_object(
    'demographics', jsonb_build_object(
      'men', (select count(*) from public.users where is_male = true),
      'women', (select count(*) from public.users where is_male = false),
      'avg_age', (select coalesce(
        floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        from public.users where birth_date is not null),
      'os_ios', (select count(*) from public.users
        where data->>'os' = 'ios'),
      'os_android', (select count(*) from public.users
        where data->>'os' = 'android')
    ),
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
        where relations->'availability'->>'state' is null),
      'no_notif', (select count(*) from public.users u
        where public.push_blocked(u.user_id))
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
      'total', (select count(*) from public.groups)
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
          and coalesce(is_event, false) = false),
      'logouts', (select count(*) from public.log
        where key = 'logout' and status < 400
          and created_at > now() - interval '7 days'),
      'deletes', (select count(*) from public.log
        where key = 'delete' and status < 400
          and created_at > now() - interval '7 days')
    )
  )
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_facet_counts()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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
    ), '{}'::jsonb),
    'avail', jsonb_build_object(
      'available',   (select count(*) from public.users u where u.relations->'availability'->>'state' = 'available'),
      'unavailable', (select count(*) from public.users u where u.relations->'availability'->>'state' = 'unavailable'),
      'not_yet',     (select count(*) from public.users u where u.relations->'availability'->>'state' = 'not_yet'),
      'unknown',     (select count(*) from public.users u where u.relations->'availability'->>'state' is null)
    ),
    'tier', jsonb_build_object(
      'free', (select count(*) from public.users u where coalesce(u.relations->'credits'->>'tier','free') = 'free'),
      'pro',  (select count(*) from public.users u where u.relations->'credits'->>'tier' = 'pro')
    ),
    'gender', jsonb_build_object(
      'male',   (select count(*) from public.users u where u.is_male = true),
      'female', (select count(*) from public.users u where u.is_male = false)
    ),
    'os', jsonb_build_object(
      'ios',     (select count(*) from public.users u where u.data->>'os' = 'ios'),
      'android', (select count(*) from public.users u where u.data->>'os' = 'android')
    ),
    'seg', jsonb_build_object(
      'online',       (select count(*) from public.users u where u.last_seen >= now() - interval '5 minutes'),
      'active_today', (select count(*) from public.users u where u.last_seen >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'active_7d',    (select count(*) from public.users u where u.last_seen >= now() - interval '7 days'),
      'active_30d',   (select count(*) from public.users u where u.last_seen >= now() - interval '30 days'),
      'new_today',    (select count(*) from public.users u where u.created_at >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'new_7d',       (select count(*) from public.users u where u.created_at >= now() - interval '7 days'),
      'new_30d',      (select count(*) from public.users u where u.created_at >= now() - interval '30 days'),
      'located',      (select count(*) from public.users u where u.location is not null),
      'broadcasting', (select count(*) from public.users u where nullif(u.relations->>'last_add_at','')::timestamptz >= now() - interval '30 minutes'),
      'held',         (select count(*) from public.users u where u.relations->'credits'->>'held' is not null and u.relations->'credits'->>'held' <> '0'),
      'no_notif',     (select count(*) from public.users u where public.push_blocked(u.user_id))
    )
  )
$$;
REVOKE ALL ON FUNCTION public.admin_user_facet_counts() FROM anon, authenticated;

-- ============================================================
-- 6. Recompute relations.availability for every user — anyone who was
-- 'unavailable, reason=group' flips back to 'available'.
-- ============================================================
UPDATE public.users
   SET relations = jsonb_set(
         relations,
         '{availability}',
         public.user_availability(user_id, location)
       )
 WHERE relations->'availability' IS DISTINCT FROM public.user_availability(user_id, location)
   AND user_id IS NOT NULL;
