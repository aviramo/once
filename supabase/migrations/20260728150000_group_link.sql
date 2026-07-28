-- 2026-07-28 — A group's "more details" link.
--
-- One optional URL per group, edited by owners/managers under the description
-- and shown to everyone as a tappable "more details" line in the group popup.
-- The column is the only new storage; everything else here is the same JSON
-- payloads with one more key, plus the update RPC learning to set it.
--
-- Normalization + validation live in ONE place (the RPC): a bare host is given
-- https://, and only http/https survive — the value is handed straight to
-- Linking.openURL on the device, so a `javascript:`/`file:` scheme must never
-- reach a client. Max 300 chars, like the description.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS link text;

-- ── app_update_group: accept link (with a provided flag) ────────────────────
-- The parameter list grows, so the old overloads are dropped rather than left
-- beside it: PostgREST resolves an overload by the NAMES it was called with,
-- and a call carrying the previous 7 would match both signatures (the new ones
-- default) and fail as ambiguous. Dropping them inside this transaction leaves
-- no window — the currently deployed edge function keeps calling with its 7
-- named arguments and lands on this one.
DROP FUNCTION IF EXISTS public.app_update_group(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.app_update_group(uuid, uuid, text, boolean, text, boolean, boolean);

CREATE FUNCTION public.app_update_group(
  me_id uuid, p_group_id uuid,
  p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean,
  p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false,
  p_requires_approval boolean DEFAULT NULL::boolean,
  p_link text DEFAULT NULL::text, p_link_provided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_desc text; v_link text;
        v_pub boolean; v_req boolean;
        v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  IF p_desc_provided THEN
    v_desc := nullif(btrim(p_description), '');
    IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  IF p_link_provided THEN
    v_link := nullif(btrim(p_link), '');
    IF v_link IS NOT NULL THEN
      -- Someone pastes "example.com/group" as often as a full URL.
      IF v_link !~* '^[a-z][a-z0-9+.-]*://' THEN v_link := 'https://' || v_link; END IF;
      IF v_link !~* '^https?://[^\s/?#]+\.[^\s/?#]+' OR v_link ~ '\s'
         OR char_length(v_link) > 300 THEN
        RETURN jsonb_build_object('error', 'bad_link');
      END IF;
    END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), coalesce(p_requires_approval, g.requires_approval)
    INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  -- The kind invariant: hidden means approved.
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req,
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END,
    link = CASE WHEN p_link_provided THEN v_link ELSE link END
   WHERE id = p_group_id;
  -- Now OPEN: nobody is left waiting for an approval that no longer exists.
  IF NOT v_req THEN v_notify := public._group_drain_requests(p_group_id); END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'link', g.link,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- Only the edge function (service_role) may call it. The dropped overloads
-- carried the Postgres default (EXECUTE to PUBLIC, i.e. anon + authenticated);
-- the replacement does not inherit an ACL, so this is the whole grant.
REVOKE ALL ON FUNCTION public.app_update_group(uuid, uuid, text, boolean, text, boolean, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_group(uuid, uuid, text, boolean, text, boolean, boolean, text, boolean) TO service_role;

-- ── The link rides along in every group payload ─────────────────────────────

CREATE OR REPLACE FUNCTION public._owned_group_json(uid uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
    'requires_approval', g.requires_approval, 'description', g.description,
    'link', g.link,
    'is_owner', (g.owner_id = uid),
    'hidden', coalesce((SELECT ug.hidden FROM public.user_groups ug
                         WHERE ug.group_id = g.id AND ug.user_id = uid), false),
    'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
    'pending', (SELECT count(*) FROM public.group_join_requests jr
                 WHERE jr.group_id = g.id AND jr.status = 'pending')
  )
  FROM public.groups g
  WHERE g.id = p_group_id
$function$;

CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
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
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'link', g.link,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_shared_groups(me_id uuid, p_other uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
      'link',        g.link,
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

CREATE OR REPLACE FUNCTION public.app_search_groups(me_id uuid, p_q text DEFAULT ''::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'extensions'
AS $function$
WITH lim AS (
  SELECT least(greatest(coalesce(p_limit, 20), 1), 50) AS n,
         greatest(coalesce(p_offset, 0), 0)            AS off,
         public._search_norm(p_q)                      AS q
),
me AS (SELECT * FROM public.users u WHERE u.user_id = me_id),
cand AS MATERIALIZED (
  SELECT o.user_id, o.relevance FROM me, public.others(me) o
),
gcand AS (
  SELECT ug.group_id, count(*)::int AS relevant, sum(c.relevance) AS fit
  FROM public.user_groups ug JOIN cand c ON c.user_id = ug.user_id
  GROUP BY ug.group_id
),
gsize AS (SELECT group_id, count(*)::int AS members FROM public.user_groups GROUP BY group_id),
hit AS (
  SELECT g.id, g.name, g.invite_code, g.owner_id, g.description, g.link, g.requires_approval,
         CASE WHEN (SELECT q FROM lim) = '' THEN 0
              ELSE public._name_match(p_q, g.name) END AS text_score
  FROM public.groups g
  WHERE g.is_public = true
    AND g.is_test = public._is_test(me_id)
),
kept AS (
  SELECT h.*,
         coalesce(gs.members, 0)  AS members,
         coalesce(gc.relevant, 0) AS relevant,
         coalesce(gc.fit, 0)      AS fit
  FROM hit h
  LEFT JOIN gcand gc ON gc.group_id = h.id
  LEFT JOIN gsize gs ON gs.group_id = h.id
  WHERE (SELECT q FROM lim) = '' OR h.text_score >= 0.6
),
page AS (
  SELECT k.*, count(*) OVER () AS total
  FROM kept k
  ORDER BY k.text_score DESC, k.fit DESC, k.members DESC, k.name, k.id
  LIMIT (SELECT n FROM lim) OFFSET (SELECT off FROM lim)
)
SELECT jsonb_build_object(
  'results', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'invite_code', p.invite_code,
      'owner_id', p.owner_id, 'owner_name', ownr.name, 'owner_image', ownr.data->'images'->0,
      'description', p.description, 'link', p.link, 'requires_approval', p.requires_approval,
      'members', p.members, 'relevant', p.relevant,
      'joined',    EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = p.id AND ug.user_id = me_id),
      'requested', EXISTS(SELECT 1 FROM public.group_join_requests jr WHERE jr.group_id = p.id AND jr.user_id = me_id)
    ) ORDER BY p.text_score DESC, p.fit DESC, p.members DESC, p.name, p.id), '[]'::jsonb),
  'has_more', coalesce(max(p.total), 0) > (SELECT off FROM lim) + count(p.id)
)
FROM page p
LEFT JOIN public.users ownr ON ownr.user_id = p.owner_id;
$function$;

-- A member reads the group's link out of their own denormalized summary
-- (relations.communities), so an edit has to reach the members' rows. The
-- fan-out trigger watched only name/is_public, which meant a description edit
-- already sat invisible on every member until some other change repainted them
-- (same bug, quieter). It now watches the two editable blurb columns as well.
DROP TRIGGER IF EXISTS comm_groups_upd ON public.groups;
CREATE TRIGGER comm_groups_upd
  AFTER UPDATE OF name, is_public, description, link ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_group();
