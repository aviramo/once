-- 2026-07-25 — Communities & Friends, phase 1 (server foundation).
--
-- ADDITIVE ONLY. Zero change to any surface the live mobile build reads:
-- _my_groups / _shared_group_name / make_profile / others / app_find /
-- app_redeem_invite / app_leave_group are ALL untouched. Communities reuse
-- the existing groups / user_groups / group_managers machinery (a joined
-- group already ranks, chips, and shows in my_groups on every shipped client
-- — a user-created group is just more of the same, no NEW behaviour). Friends
-- live in brand-new isolated tables so the legacy read paths cannot see them.
--
-- DEFERRED (staged for a later Expand→Migrate→Contract): wiring the new
-- friend edge into the ×3 same-group relevance boost. Phase 1 stores + manages
-- friends only; it does not touch others()/_shared_group_name. Nothing here is
-- a breaking change, so no BACKWARD_COMPAT.md entry is required.

-- ── groups: owner + public flag (additive columns) ─────────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS owner_id  uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Existing admin groups keep owner_id = NULL (admin-owned) and is_public =
-- false (join by code only, today's behaviour). Untouched on every client.

-- Two owners may name a community the same ("יוגה"); invite_code stays the
-- real globally-unique identity. Verified: no RPC inserts into groups and the
-- admin creates via a service-role insert, so nothing relies on this UNIQUE.
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_name_key;

CREATE INDEX IF NOT EXISTS groups_owner_idx  ON public.groups(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_public_idx ON public.groups(is_public) WHERE is_public = true;

-- ── friends: mutual, consented edges (brand-new, isolated) ─────────────────
-- friend_links stores each unordered pair ONCE (a < b). "My friends" is
-- derived from this table, never a groups row — it has no name and must stay
-- out of the legacy group read paths.
CREATE TABLE IF NOT EXISTS public.friend_links (
  a          uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  b          uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  via        text,  -- 'referral' | 'link' — audit of how the pair connected
  PRIMARY KEY (a, b),
  CONSTRAINT friend_links_canonical CHECK (a < b)
);
ALTER TABLE public.friend_links ENABLE ROW LEVEL SECURITY;  -- service-role only
CREATE INDEX IF NOT EXISTS friend_links_b_idx ON public.friend_links(b);

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  target_id    uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT friend_requests_distinct CHECK (requester_id <> target_id)
);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;  -- service-role only
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_uq
  ON public.friend_requests(requester_id, target_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friend_requests_target_idx
  ON public.friend_requests(target_id) WHERE status = 'pending';

-- ── Community RPCs (new; called only by the new mobile build) ──────────────

-- Create a user-owned community. Creator becomes owner + member + manager.
CREATE OR REPLACE FUNCTION public.app_create_group(me_id uuid, p_name text, p_is_public boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_name text;
  v_id   uuid;
  v_code text;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object('error', 'bad_name');
  END IF;
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public)
    VALUES (v_name, v_code, me_id, coalesce(p_is_public, false))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', coalesce(p_is_public, false), 'owner', true, 'members', 1));
END;
$$;

-- Groups the caller owns, with live member counts.
CREATE OR REPLACE FUNCTION public.app_owned_groups(me_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'is_public', g.is_public,
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)
  ) ORDER BY g.created_at DESC), '[]'::jsonb)
  FROM public.groups g WHERE g.owner_id = me_id;
$$;

-- Owner/manager-only roster: name + main photo, no profile access.
CREATE OR REPLACE FUNCTION public.app_group_members(me_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_owner uuid;
  v_ok    boolean := false;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id);
  IF NOT v_ok THEN
    v_ok := EXISTS(SELECT 1 FROM public.group_managers
                    WHERE group_id = p_group_id AND user_id = me_id);
  END IF;
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  RETURN jsonb_build_object('members', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', u.user_id,
      'name',    u.name,
      'image',   u.data->'images'->0,
      'owner',   (u.user_id = v_owner)
    ) ORDER BY (u.user_id = v_owner) DESC, u.name)
    FROM public.user_groups ug JOIN public.users u ON u.user_id = ug.user_id
    WHERE ug.group_id = p_group_id), '[]'::jsonb));
END;
$$;

-- Owner removes a member (never the owner). Returns the fresh roster.
CREATE OR REPLACE FUNCTION public.app_remove_member(me_id uuid, p_group_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'cant_remove_owner'); END IF;
  DELETE FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id;
  UPDATE public.users
     SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
   WHERE user_id = p_user_id;
  RETURN public.app_group_members(me_id, p_group_id);
END;
$$;

-- Rename / toggle privacy (owner only).
CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL, p_is_public boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_owner uuid;
  v_name  text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  UPDATE public.groups
     SET name      = coalesce(v_name, name),
         is_public = coalesce(p_is_public, is_public)
   WHERE id = p_group_id;
  RETURN (SELECT jsonb_build_object('group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
            'is_public', g.is_public, 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END;
$$;

-- Delete an owned group (clear memberships first — user_groups FK is RESTRICT;
-- group_managers cascades on the groups delete).
CREATE OR REPLACE FUNCTION public.app_delete_group(me_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_owner   uuid;
  v_members uuid[];
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  SELECT array_agg(user_id) INTO v_members FROM public.user_groups WHERE group_id = p_group_id;
  DELETE FROM public.user_groups WHERE group_id = p_group_id;
  DELETE FROM public.groups      WHERE id = p_group_id;
  -- Recompute availability for everyone who was in it.
  IF v_members IS NOT NULL THEN
    UPDATE public.users
       SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
     WHERE user_id = ANY(v_members);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Search PUBLIC groups by name (private groups never surface here).
CREATE OR REPLACE FUNCTION public.app_search_groups(me_id uuid, p_q text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
    'joined',  EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = g.id AND ug.user_id = me_id)
  ) ORDER BY g.name), '[]'::jsonb)
  FROM public.groups g
  WHERE g.is_public = true
    AND nullif(btrim(p_q), '') IS NOT NULL
    AND char_length(btrim(p_q)) >= 2
    AND g.name ILIKE '%' || btrim(p_q) || '%'
  LIMIT 30;
$$;

-- ── Friend RPCs (new; isolated tables) ─────────────────────────────────────

-- Search people by name to link as friends. Min 2 chars; excludes self,
-- existing friends flagged, pending requests flagged.
CREATE OR REPLACE FUNCTION public.app_search_people(me_id uuid, p_q text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id',   u.user_id,
    'name',      u.name,
    'image',     u.data->'images'->0,
    'requested', EXISTS(SELECT 1 FROM public.friend_requests fr
                         WHERE fr.requester_id = me_id AND fr.target_id = u.user_id AND fr.status = 'pending'),
    'friend',    EXISTS(SELECT 1 FROM public.friend_links fl
                         WHERE fl.a = LEAST(me_id, u.user_id) AND fl.b = GREATEST(me_id, u.user_id))
  ) ORDER BY u.name), '[]'::jsonb)
  FROM public.users u
  WHERE nullif(btrim(p_q), '') IS NOT NULL
    AND char_length(btrim(p_q)) >= 2
    AND u.user_id <> me_id
    AND u.name IS NOT NULL
    AND u.name ILIKE '%' || btrim(p_q) || '%'
  LIMIT 30;
$$;

-- Send a friend request. If the target already has a pending request to me,
-- accept that instead (auto-link). Notifies the target on a fresh request.
CREATE OR REPLACE FUNCTION public.app_friend_request(me_id uuid, p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_reverse uuid;
  v_a uuid := LEAST(me_id, p_target_id);
  v_b uuid := GREATEST(me_id, p_target_id);
BEGIN
  IF p_target_id IS NULL OR p_target_id = me_id THEN RETURN jsonb_build_object('error', 'bad_target'); END IF;
  -- Already friends → no-op success.
  IF EXISTS(SELECT 1 FROM public.friend_links WHERE a = v_a AND b = v_b) THEN
    RETURN jsonb_build_object('status', 'friends');
  END IF;
  -- Reverse pending request exists → accept it now.
  SELECT id INTO v_reverse FROM public.friend_requests
   WHERE requester_id = p_target_id AND target_id = me_id AND status = 'pending';
  IF v_reverse IS NOT NULL THEN
    UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = v_reverse;
    INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'link') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status', 'friends',
      'notify', jsonb_build_array(jsonb_build_object('user_id', p_target_id, 'code', 'friend_accept', 'actor_id', me_id)));
  END IF;
  INSERT INTO public.friend_requests(requester_id, target_id)
    VALUES (me_id, p_target_id)
    ON CONFLICT (requester_id, target_id) WHERE status = 'pending' DO NOTHING;
  RETURN jsonb_build_object('status', 'requested',
    'notify', jsonb_build_array(jsonb_build_object('user_id', p_target_id, 'code', 'friend_request', 'actor_id', me_id)));
END;
$$;

-- Respond to an incoming request (me = target). Accept → create the link.
CREATE OR REPLACE FUNCTION public.app_friend_respond(me_id uuid, p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_req    public.friend_requests%ROWTYPE;
  v_a uuid; v_b uuid;
BEGIN
  SELECT * INTO v_req FROM public.friend_requests WHERE id = p_request_id;
  IF v_req.id IS NULL OR v_req.target_id <> me_id OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'bad_request');
  END IF;
  IF p_accept THEN
    UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = p_request_id;
    v_a := LEAST(v_req.requester_id, me_id);
    v_b := GREATEST(v_req.requester_id, me_id);
    INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'link') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status', 'accepted',
      'notify', jsonb_build_array(jsonb_build_object('user_id', v_req.requester_id, 'code', 'friend_accept', 'actor_id', me_id)));
  ELSE
    UPDATE public.friend_requests SET status = 'declined', responded_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'declined');
  END IF;
END;
$$;

-- My friends roster (name + main photo) plus incoming pending requests.
CREATE OR REPLACE FUNCTION public.app_my_friends(me_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'friends', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0
      ) ORDER BY u.name)
      FROM public.friend_links fl
      JOIN public.users u ON u.user_id = CASE WHEN fl.a = me_id THEN fl.b ELSE fl.a END
      WHERE fl.a = me_id OR fl.b = me_id), '[]'::jsonb),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fr.id, 'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0
      ) ORDER BY fr.created_at DESC)
      FROM public.friend_requests fr
      JOIN public.users u ON u.user_id = fr.requester_id
      WHERE fr.target_id = me_id AND fr.status = 'pending'), '[]'::jsonb)
  );
$$;

-- Remove a friend (both directions — the pair is stored once).
CREATE OR REPLACE FUNCTION public.app_unfriend(me_id uuid, p_other_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.friend_links
   WHERE a = LEAST(me_id, p_other_id) AND b = GREATEST(me_id, p_other_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;
