-- admin_log_for_user(user, limit) — admin-only log feed centred on one user.
-- Returns every log row in the recent window where the user was either the
-- caller (l.user_id) OR is mentioned anywhere in the request/response payload
-- or the post-transaction user snapshot. The substring match catches events
-- other users initiated that affected this user (e.g. someone invited them,
-- someone matched with them, someone removed them as a viewer) — those rows
-- live under the OTHER user's user_id, but reference this user's uuid in their
-- log/user jsonb. ILIKE on jsonb::text is a sequential scan; capped at 60d +
-- LIMIT to bound cost. Admin/service-role only (EXECUTE revoked from
-- anon/authenticated), called from the web admin user detail page only.
CREATE OR REPLACE FUNCTION public.admin_log_for_user(
  p_user_id uuid,
  p_limit int DEFAULT 300
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  user_id uuid,
  key text,
  status smallint,
  run_ms integer,
  log jsonb,
  "user" jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    l.id,
    l.created_at,
    l.user_id,
    l.key,
    l.status,
    l.run_ms,
    l.log,
    l."user"
  FROM public.log l
  WHERE l.created_at > now() - interval '60 days'
    AND (
      l.user_id = p_user_id
      OR l.log::text ILIKE '%' || p_user_id::text || '%'
      OR l."user"::text ILIKE '%' || p_user_id::text || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT p_limit
$$;

REVOKE EXECUTE ON FUNCTION public.admin_log_for_user(uuid, int) FROM anon, authenticated;
