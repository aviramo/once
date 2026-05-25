-- 2026-05-25 — scope admin_dashboard_metrics to a user-id list when called by
-- a group manager. NULL p_user_ids preserves the original global behaviour
-- (the no-arg call signature still resolves via the default). Non-null
-- filters every users-related subquery to that set; chat/log filters use it
-- too. Areas/groups counts stay global (the page hides them for managers).
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(p_user_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men', (SELECT count(*) FROM public.users
               WHERE is_male = true
                 AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'women', (SELECT count(*) FROM public.users
                 WHERE is_male = false
                   AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'avg_age', (SELECT coalesce(
          floor(avg(extract(year from age(now(), birth_date))))::int, 0)
          FROM public.users
         WHERE birth_date IS NOT NULL
           AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_ios', (SELECT count(*) FROM public.users
                  WHERE data->>'os' = 'ios'
                    AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_android', (SELECT count(*) FROM public.users
                      WHERE data->>'os' = 'android'
                        AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.users
                 WHERE (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_today', (SELECT count(*) FROM public.users
                     WHERE (created_at at time zone 'Asia/Jerusalem')::date
                         = (now() at time zone 'Asia/Jerusalem')::date
                       AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_7d', (SELECT count(*) FROM public.users
                  WHERE created_at > now() - interval '7 days'
                    AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_30d', (SELECT count(*) FROM public.users
                   WHERE created_at > now() - interval '30 days'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'online_5m', (SELECT count(*) FROM public.users
                     WHERE last_seen > now() - interval '5 minutes'
                       AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_today', (SELECT count(*) FROM public.users
                        WHERE (last_seen at time zone 'Asia/Jerusalem')::date
                            = (now() at time zone 'Asia/Jerusalem')::date
                          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_7d', (SELECT count(*) FROM public.users
                     WHERE last_seen > now() - interval '7 days'
                       AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_30d', (SELECT count(*) FROM public.users
                      WHERE last_seen > now() - interval '30 days'
                        AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_location', (SELECT count(*) FROM public.users
                         WHERE location IS NOT NULL
                           AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'engagement', jsonb_build_object(
      'chat', (SELECT count(*) FROM public.users
                WHERE relations->'page1'->>'state' = 'chat'
                  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'waiting', (SELECT count(*) FROM public.users
                   WHERE relations->'page1'->>'state' = 'waiting'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'watching', (SELECT count(*) FROM public.users
                    WHERE relations->'page1'->>'state' = 'watching'
                      AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'pending', (SELECT count(*) FROM public.users
                   WHERE relations->'page2'->>'state' = 'pending'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'broadcasting', (SELECT count(*) FROM public.users
                        WHERE (relations->>'last_add_at') IS NOT NULL
                          AND (relations->>'last_add_at')::timestamptz
                              > now() - interval '30 minutes'
                          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'availability', jsonb_build_object(
      'available', (SELECT count(*) FROM public.users
                     WHERE relations->'availability'->>'state' = 'available'
                       AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unavailable', (SELECT count(*) FROM public.users
                       WHERE relations->'availability'->>'state' = 'unavailable'
                         AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'not_yet', (SELECT count(*) FROM public.users
                   WHERE relations->'availability'->>'state' = 'not_yet'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unknown', (SELECT count(*) FROM public.users
                   WHERE relations->'availability'->>'state' IS NULL
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'no_notif', (SELECT count(*) FROM public.users u
                    WHERE public.push_blocked(u.user_id)
                      AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids)))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum(
            (relations->'credits'->>'balance')::int), 0)
          FROM public.users
         WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'
           AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'held_total', (SELECT coalesce(sum(
            (relations->'credits'->>'held')::int), 0)
          FROM public.users
         WHERE relations->'credits'->>'held' ~ '^[0-9]+$'
           AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'tier_free', (SELECT count(*) FROM public.users
                     WHERE coalesce(relations->'credits'->>'tier', 'free') = 'free'
                       AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'tier_pro', (SELECT count(*) FROM public.users
                    WHERE relations->'credits'->>'tier' = 'pro'
                      AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'areas', jsonb_build_object(
      'total', (SELECT count(*) FROM public.areas),
      'active', (SELECT count(*) FROM public.areas WHERE mode = 'active'),
      'scheduled', (SELECT count(*) FROM public.areas WHERE mode = 'scheduled'),
      'disabled', (SELECT count(*) FROM public.areas WHERE mode = 'disabled')
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups', (SELECT count(*) FROM public.users
                   WHERE created_at > now() - interval '7 days'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'invites', (SELECT count(*) FROM public.log
                   WHERE key = 'invite' AND status < 400
                     AND created_at > now() - interval '7 days'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'approves', (SELECT count(*) FROM public.log
                    WHERE key = 'approve' AND status < 400
                      AND created_at > now() - interval '7 days'
                      AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'messages', (SELECT count(*) FROM public.chat
                    WHERE created_at > now() - interval '7 days'
                      AND coalesce(is_event, false) = false
                      AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids) OR other_id = ANY(p_user_ids))),
      'logouts', (SELECT count(*) FROM public.log
                   WHERE key = 'logout' AND status < 400
                     AND created_at > now() - interval '7 days'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'deletes', (SELECT count(*) FROM public.log
                   WHERE key = 'delete' AND status < 400
                     AND created_at > now() - interval '7 days'
                     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    )
  )
$$;
