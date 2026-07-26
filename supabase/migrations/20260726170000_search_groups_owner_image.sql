-- 2026-07-26 — search_groups returns the owner's id + main photo.
--
-- FindView shows the owner's avatar (not a generic group glyph) on each search
-- result. app_search_groups already joined the owner for owner_name; add the
-- owner's user_id and main image so the client can render the shared Avatar.
-- ADDITIVE: new keys only; old clients ignore them. Admin-owned groups have
-- owner_id NULL, so both fields come back null and the client falls back to the
-- group glyph.

CREATE OR REPLACE FUNCTION public.app_search_groups(me_id uuid, p_q text)
RETURNS jsonb LANGUAGE sql STABLE AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'owner_id', g.owner_id, 'owner_name', ownr.name, 'owner_image', ownr.data->'images'->0,
    'description', g.description, 'requires_approval', g.requires_approval,
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
    'joined',  EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = g.id AND ug.user_id = me_id),
    'requested', EXISTS(SELECT 1 FROM public.group_join_requests jr WHERE jr.group_id = g.id AND jr.user_id = me_id)
  ) ORDER BY g.name), '[]'::jsonb)
  FROM public.groups g
  LEFT JOIN public.users ownr ON ownr.user_id = g.owner_id
  WHERE g.is_public = true AND nullif(btrim(p_q), '') IS NOT NULL
    AND char_length(btrim(p_q)) >= 2 AND g.name ILIKE '%' || btrim(p_q) || '%'
  LIMIT 30;
$function$;
