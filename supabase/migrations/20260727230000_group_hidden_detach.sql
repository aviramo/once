-- 2026-07-27 — Turning "stay out of the game here" on takes effect NOW.
--
-- The candidacy filter added with the flag only governs the NEXT pick: someone
-- already parked on your card keeps looking at it until they skip, which may be
-- never. So flipping the switch also unparks the pairs it is about — the same
-- silent release the admin reset uses (_admin_reset_detach step 2), scoped to
-- one group and one person instead of the whole board.
--
-- Deliberately limited to the UNCOMMITTED states: a watch, and a place in a
-- viewer list. A live invitation and an open chat are conversations already
-- under way and are left alone — a preference switch must not end someone's
-- chat out from under them. The pair simply never meets again after that.

CREATE OR REPLACE FUNCTION public._detach_hidden_pairs(p_me uuid, p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ids  uuid[];
  v_text text[];
BEGIN
  SELECT coalesce(array_agg(ug.user_id), '{}'::uuid[]) INTO v_ids
    FROM public.user_groups ug
   WHERE ug.group_id = p_group_id
     AND ug.user_id <> p_me;
  IF array_length(v_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(x::text) INTO v_text FROM unnest(v_ids) x;

  -- Ordered lock over everyone this touches — the house rule for a multi-row
  -- transition (see app_lock2), so two of these can never deadlock.
  PERFORM 1 FROM public.users WHERE user_id = ANY(ARRAY[p_me] || v_ids) ORDER BY user_id FOR UPDATE;

  -- 1. A member parked on my card, and me parked on a member's card: both
  --    released back to 'free', silently. Their next pick is drawn from a pool
  --    this pair is no longer in.
  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{page1}', jsonb_build_object('state', 'free'))
   WHERE u.relations->'page1'->>'state' = 'watching'
     AND (
       (u.user_id = ANY(v_ids) AND u.relations->'page1'->'profile'->>'user_id' = p_me::text)
       OR
       (u.user_id = p_me AND u.relations->'page1'->'profile'->>'user_id' = ANY(v_text))
     );

  -- 2. Each side drops out of the other's viewer list.
  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{page2,profiles}',
           coalesce((SELECT jsonb_agg(v)
                       FROM jsonb_array_elements(u.relations->'page2'->'profiles') v
                      WHERE NOT (v->>'user_id' = ANY(v_text))), '[]'::jsonb))
   WHERE u.user_id = p_me
     AND u.relations->'page2'->>'state' = 'free'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(u.relations->'page2'->'profiles') v
                  WHERE v->>'user_id' = ANY(v_text));

  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{page2,profiles}',
           coalesce((SELECT jsonb_agg(v)
                       FROM jsonb_array_elements(u.relations->'page2'->'profiles') v
                      WHERE v->>'user_id' <> p_me::text), '[]'::jsonb))
   WHERE u.user_id = ANY(v_ids)
     AND u.relations->'page2'->>'state' = 'free'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(u.relations->'page2'->'profiles') v
                  WHERE v->>'user_id' = p_me::text);
END $function$;

CREATE OR REPLACE FUNCTION public.app_set_group_hidden(me_id uuid, p_group_id uuid, p_hidden boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.groups WHERE id = p_group_id) THEN
    RETURN jsonb_build_object('error', 'no_group');
  END IF;
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id)
       OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;

  UPDATE public.user_groups
     SET hidden = p_hidden
   WHERE group_id = p_group_id AND user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_member'); END IF;

  -- Immediate effect, not just from the next pick onwards.
  IF p_hidden THEN PERFORM public._detach_hidden_pairs(me_id, p_group_id); END IF;

  -- The flag rides in the denormalized summary, and the membership trigger only
  -- fires on INSERT/DELETE, so the refresh is explicit here.
  PERFORM public._refresh_communities(me_id);
  RETURN jsonb_build_object('group', public._owned_group_json(me_id, p_group_id));
END $function$;
