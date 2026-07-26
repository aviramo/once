-- 2026-07-26 — Friend invite by link (auto-link, no approval).
--
-- The friends screen's single "invite a friend" button shares a link that
-- carries the inviter's referral_code (the same per-user code the credit
-- referral uses). When the invitee opens it with the app INSTALLED, the app
-- deep-links (once://f/<CODE>) and calls /app/friend_link, which lands here:
-- the pair is connected as mutual friends IMMEDIATELY, with no request and no
-- approval step (user directive 2026-07-26). A fresh install reaches the same
-- RPC on first launch via the Play install-referrer path.
--
-- ADDITIVE ONLY. Reuses the isolated friend_links table from phase 1; the
-- request/accept RPCs (app_friend_request / app_friend_respond) stay untouched
-- for the deployed build that still drives the people-search flow. No breaking
-- change → no BACKWARD_COMPAT.md entry.

-- Connect the caller to the owner of referral code p_code as mutual friends.
-- Idempotent (the pair is stored once, a < b; a repeat is a no-op success).
-- Notifies the inviter only on a genuinely NEW link. Returns the caller's
-- fresh friends roster so the screen repaints without a second round trip.
CREATE OR REPLACE FUNCTION public.app_friend_link_by_code(me_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_inviter uuid;
  v_a       uuid;
  v_b       uuid;
  v_rows    int := 0;
  v_new     boolean := false;
BEGIN
  IF v_code = '' THEN RETURN jsonb_build_object('error', 'no_code'); END IF;

  SELECT user_id INTO v_inviter FROM public.users WHERE referral_code = v_code;
  IF v_inviter IS NULL THEN RETURN jsonb_build_object('error', 'bad_code'); END IF;
  -- Sharing your own link with yourself is a harmless no-op, not an error: the
  -- client should still land on the friends list cleanly.
  IF v_inviter = me_id THEN
    RETURN jsonb_build_object('status', 'self') || public.app_my_friends(me_id);
  END IF;

  v_a := LEAST(me_id, v_inviter);
  v_b := GREATEST(me_id, v_inviter);

  INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'referral')
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;  -- 1 = a new link was created, 0 = already friends
  v_new := v_rows > 0;

  -- Clear any leftover pending request in either direction (they connected the
  -- direct way now), so a stale request can't linger in someone's inbox.
  UPDATE public.friend_requests SET status = 'accepted', responded_at = now()
   WHERE status = 'pending'
     AND ((requester_id = me_id AND target_id = v_inviter)
       OR (requester_id = v_inviter AND target_id = me_id));

  RETURN jsonb_build_object(
    'status', CASE WHEN v_new THEN 'linked' ELSE 'already' END,
    'notify', CASE WHEN v_new
      THEN jsonb_build_array(jsonb_build_object('user_id', v_inviter, 'code', 'friend_link', 'actor_id', me_id))
      ELSE '[]'::jsonb END
  ) || public.app_my_friends(me_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_friend_link_by_code(uuid, text) FROM anon, authenticated;
