-- A DECLINED join request opens the app's ONE group popup exactly as a
-- membership and a pending request do, and that popup LEADS with who runs the
-- group: the owner's face, with "managed by <them>" under it. The declined
-- entries of the denormalized summary were the only branch never given the
-- owner object (the pending rollout on 2026-07-28 added it to `pending` and
-- stopped there), so the same group lost its face and its whole meta line when
-- it was opened from a declined row and kept them everywhere else.
--
-- Purely additive: an older client reads past a key it does not know, and every
-- other branch is byte-identical to what is live. `invite_code` stays OFF this
-- branch deliberately — someone who was turned down is not a member and has no
-- link to hand on. Version bumped to 4 so the users trigger rebuilds each row on
-- its next relations write, exactly as the owner rollout did, instead of a table
-- sweep. Both functions are re-declared with the SECURITY DEFINER + search_path
-- they carry live (2026-07-29, the auth-cascade fix) — CREATE OR REPLACE
-- replaces the whole declaration, so dropping those would re-break account
-- deletion from the admin panel. Grants survive a replace untouched.
CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    'v', 4,
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
        'link', g.link,
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
        'link', g.link,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
        'owner', public._group_owner_json(g.owner_id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'link', g.link,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
        'owner', public._group_owner_json(g.owner_id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

CREATE OR REPLACE FUNCTION public._users_keep_communities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.relations IS NULL
     OR NOT (NEW.relations ? 'communities')
     OR (NEW.relations->'communities'->>'v') IS DISTINCT FROM '4'
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
