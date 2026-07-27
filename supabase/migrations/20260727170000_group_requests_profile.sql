-- Join requests carry the requester's PROFILE.
--
-- The approver decides whether to let a stranger into their group; a name and a
-- thumbnail are not enough to decide on (user directive 2026-07-27). The queue
-- row becomes a plain row that opens the requester's profile card, so the same
-- payload the app already renders for a match rides along with every request.
--
-- Deliberately WITHOUT distance: someone who has only asked to join has not
-- agreed to reveal where they are. `make_profile` strips the null, so the card
-- simply has no distance chip. `viewer_id` is passed so an ALREADY shared group
-- (the requester and the approver meeting elsewhere) still shows: that is
-- exactly the signal an approver wants.
--
-- Additive only: `name` / `image` / `created_at` stay, so the published app,
-- which reads only those, is untouched.
CREATE OR REPLACE FUNCTION public.app_group_requests(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_owner uuid; v_ok boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  RETURN jsonb_build_object('requests', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', jr.id, 'user_id', u.user_id, 'name', u.name,
      'image', u.data->'images'->0, 'created_at', jr.created_at,
      'profile', public.make_profile(u, NULL::int, me_id)
    ) ORDER BY jr.created_at)
    FROM public.group_join_requests jr JOIN public.users u ON u.user_id = jr.user_id
    WHERE jr.group_id = p_group_id), '[]'::jsonb));
END; $function$;
