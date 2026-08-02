-- A GROUP LINK LANDS ON THE CIRCLE IT NAMED (user directive 2026-08-02).
--
-- Tapping once://g/<TOKEN> opened the Circles hub and stopped there: the user
-- who followed a link to a specific circle was handed a LIST and left to find
-- it. The hub now opens that circle's own popup over itself, in whatever
-- standing the redeem just gave him (a member, or a request waiting on an
-- answer) — so the redeem has to say WHICH circle, and say enough about it to
-- paint the popup on the first frame.
--
-- The client cannot read it off the denormalized summary instead: an invoke
-- response has its `relations` stripped on the way into the store (only
-- Realtime and an explicit fetch are authoritative for it), so the summary
-- carrying the new membership lands a beat later, over a popup that would have
-- had nothing to draw.
--
-- Purely ADDITIVE: `group` is a new key on the redeem_invite response body. The
-- published mobile build ignores it, so no Expand/Contract staging and no
-- BACKWARD_COMPAT.md entry.

-- ── The one description of a circle a member/requester is shown ────────────
-- Exactly the object _communities_summary already embedded for its `joined` and
-- `pending` rows, stated ONCE so the two can never drift: the popup reads the
-- same fields whichever of the two handed it over. The invite code rides along
-- for PUBLIC groups only — a public code is not a secret, so a member may share
-- the link; a private group's is the owner's to hand out.
CREATE OR REPLACE FUNCTION public._group_brief_json(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
    'link', g.link,
    'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
    'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
    'owner', public._group_owner_json(g.owner_id)
  )
  FROM public.groups g
  WHERE g.id = p_group_id;
$function$;

REVOKE ALL ON FUNCTION public._group_brief_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._group_brief_json(uuid) TO service_role;

-- The summary's two membership lists now read that one definition.
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
      SELECT jsonb_agg(public._group_brief_json(g.id) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(public._group_brief_json(g.id) ORDER BY g.name)
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

-- ── The redeem says which circle it let you into ───────────────────────────
-- Unchanged in every other respect; the only new line is `group`, built from the
-- helper above and returned for EVERY outcome (joined / pending / already /
-- declined), because the popup opens on all four and the standing is what
-- `join_status` already says.
CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_group_id   uuid;
  v_group_name text;
  v_requires   boolean;
  v_group_test boolean;
  v_is_member  boolean;
  v_is_staff   boolean;
  v_declined   timestamptz;
  v_status     text := 'joined';
  v_notify     jsonb := '[]'::jsonb;
  result_user  json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR char_length(p_code) > 64 THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id, name, requires_approval, is_test
    INTO v_group_id, v_group_name, v_requires, v_group_test
    FROM public.groups WHERE invite_code = p_code;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  IF v_group_test IS DISTINCT FROM public._is_test(me_id) THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM public.user_groups WHERE user_id = me_id AND group_id = v_group_id);
  v_is_staff  := EXISTS(SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.owner_id = me_id)
              OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);
  SELECT jr.responded_at INTO v_declined
    FROM public.group_join_requests jr
   WHERE jr.group_id = v_group_id AND jr.user_id = me_id AND jr.status <> 'pending';

  IF v_is_member THEN
    v_status := 'already';
  ELSIF EXISTS(SELECT 1 FROM public.group_join_requests jr
                WHERE jr.group_id = v_group_id AND jr.user_id = me_id AND jr.status = 'pending') THEN
    v_status := 'pending';
  ELSIF v_requires AND NOT v_is_staff
        AND v_declined IS NOT NULL
        AND v_declined > now() - public._join_decline_cooldown() THEN
    v_status := 'declined';
  ELSIF v_requires AND NOT v_is_staff THEN
    INSERT INTO public.group_join_requests(group_id, user_id)
      VALUES (v_group_id, me_id)
      ON CONFLICT (group_id, user_id) DO UPDATE
        SET status = 'pending', responded_at = NULL, created_at = now();
    v_status := 'pending';
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
             'user_id', staff_id, 'code', 'group_join',
             'group_id', v_group_id, 'group_name', v_group_name)), '[]'::jsonb)
      INTO v_notify
      FROM (
        SELECT g.owner_id AS staff_id FROM public.groups g WHERE g.id = v_group_id AND g.owner_id IS NOT NULL
        UNION
        SELECT gm.user_id FROM public.group_managers gm WHERE gm.group_id = v_group_id
      ) staff
      WHERE staff_id <> me_id;
  ELSE
    INSERT INTO public.user_groups(user_id, group_id) VALUES (me_id, v_group_id)
      ON CONFLICT (user_id, group_id) DO NOTHING;
    UPDATE public.users
       SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
     WHERE user_id = me_id;
    DELETE FROM public.group_join_requests WHERE group_id = v_group_id AND user_id = me_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',        result_user,
    'notify',      v_notify,
    'groups',      public._my_groups(me_id),
    'group',       public._group_brief_json(v_group_id),
    'join_status', v_status
  );
END; $function$;
