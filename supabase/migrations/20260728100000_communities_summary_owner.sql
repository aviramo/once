-- The denormalized communities summary carries the OWNER of every group you're
-- a member of, so the member popup can show who runs it (photo + name) the same
-- way the search preview and the shared-groups popup already do.
--
-- Rollout without a backfill: the summary now stamps a version, and the users
-- trigger recomputes a row whose stamp is behind. Every user's summary is
-- therefore rebuilt on their next relations write (any game action, any login),
-- at the same cost the "key is missing" branch already paid, instead of an
-- UPDATE sweeping every row in the table.

-- The owner object, defined once: the shape app_shared_groups established
-- ({user_id, name, image}), now shared by both call sites. NULL for an
-- owner-less (admin) group, which lands as JSON null in the parent object.
CREATE OR REPLACE FUNCTION public._group_owner_json(p_owner uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'user_id', o.user_id,
    'name',    o.name,
    'image',   o.data->'images'->0
  )
  FROM public.users o
  WHERE o.user_id = p_owner;
$function$;

REVOKE ALL ON FUNCTION public._group_owner_json(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._group_owner_json(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._group_owner_json(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._group_owner_json(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    -- Bump this when a stored summary must be rebuilt; the users trigger reads
    -- it and refreshes anything older.
    'v', 2,
    'managed', coalesce((
      SELECT jsonb_agg(public._owned_group_json(uid, g.id)
                       ORDER BY (g.owner_id = uid) DESC, g.created_at DESC)
      FROM public.groups g
      WHERE g.owner_id = uid
         OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'joined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
        'owner', public._group_owner_json(g.owner_id)
      ) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

-- Same trigger, one more reason to recompute: a summary written before the
-- current version. It still costs exactly one rebuild per user.
CREATE OR REPLACE FUNCTION public._users_keep_communities()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.relations IS NULL
     OR NOT (NEW.relations ? 'communities')
     OR (NEW.relations->'communities'->>'v') IS DISTINCT FROM '2'
  THEN
    NEW.relations := jsonb_set(
      coalesce(NEW.relations, '{}'::jsonb),
      '{communities}',
      public._communities_summary(NEW.user_id)
    );
  END IF;
  RETURN NEW;
END
$function$;

-- Fold the inline owner object into the shared helper: one definition of the
-- shape, two readers. Output is byte-identical to what it built before.
CREATE OR REPLACE FUNCTION public.app_shared_groups(me_id uuid, p_other uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('groups', coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          g.id,
      'name',        g.name,
      'members',     cnt.n,
      'is_public',   g.is_public,
      'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
      'description', g.description,
      'owner',       public._group_owner_json(g.owner_id)
    )
    ORDER BY cnt.n ASC, g.name ASC
  ), '[]'::jsonb))
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n FROM public.user_groups m WHERE m.group_id = g.id
  ) cnt
  WHERE ug_a.user_id = me_id
    AND ug_b.user_id = p_other
    AND NOT ug_a.hidden
    AND NOT ug_b.hidden
$function$;
