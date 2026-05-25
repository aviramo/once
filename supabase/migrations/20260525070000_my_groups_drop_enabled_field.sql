-- 2026-05-25 — `_my_groups` still emitted an `enabled` field after the
-- column was dropped by `drop_group_disable`. Any call to it (via
-- app_my_groups / app_leave_group / app_redeem_invite) now errors with
-- "column g.enabled does not exist". Drop the field from the emitted
-- object — the mobile client treats every group as joinable now.
CREATE OR REPLACE FUNCTION public._my_groups(me_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id',   g.id,
      'name', g.name
    ) ORDER BY g.name),
    '[]'::jsonb
  )
  FROM public.user_groups ug
  JOIN public.groups       g ON g.id = ug.group_id
  WHERE ug.user_id = me_id;
$$;
