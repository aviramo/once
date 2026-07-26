-- 2026-07-26 — app_shared_groups: the tappable group chip's detail list.
--
-- The on-photo group chip names one shared group (the smallest, via
-- _shared_group_name) and hints "+N" more. Tapping it opens a popup that lists
-- ALL the groups the viewer and the profile's subject share, each with its
-- owner (name + main photo) and member count. This RPC backs that popup.
--
-- Ordered smallest-group-first, name as tiebreak, so the list leads with the
-- same group the chip already names. Owner is NULL for admin-owned groups
-- (groups.owner_id NULL). owner.image is data.images[0] — the same {hash,normal}
-- shape app_group_members embeds, fed to publicImageUrl on the client.
-- Additive, read-only, SECURITY DEFINER; no requiresPresence gate.
CREATE OR REPLACE FUNCTION public.app_shared_groups(me_id uuid, p_other uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object('groups', coalesce(jsonb_agg(
    jsonb_build_object(
      'id',      g.id,
      'name',    g.name,
      'members', cnt.n,
      'owner',   CASE WHEN o.user_id IS NOT NULL
                      THEN jsonb_build_object(
                        'user_id', o.user_id,
                        'name',    o.name,
                        'image',   o.data->'images'->0
                      )
                      ELSE NULL END
    )
    ORDER BY cnt.n ASC, g.name ASC
  ), '[]'::jsonb))
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  LEFT JOIN public.users o ON o.user_id = g.owner_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n FROM public.user_groups m WHERE m.group_id = g.id
  ) cnt
  WHERE ug_a.user_id = me_id
    AND ug_b.user_id = p_other
$$;
