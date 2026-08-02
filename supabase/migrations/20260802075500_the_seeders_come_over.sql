-- The two seeders come over: app_find (give me somebody to look at) and
-- app_seed_viewer (pin somebody to look at ME).
--
-- CONSOLIDATED (applied as two migrations).
--
-- Everything they decided from boards they decide from rows: who is already on
-- my card, who is already looking at me, whether the person I picked can still
-- take a viewer. Rules unchanged, including the subtle one app_find's old
-- comment spells out — whoever is on my card stays OUT of this draw, unless the
-- watch has LAPSED, because an expiry is not a skip and in a pool this size
-- re-offering that face is often the difference between a card and "no one
-- nearby".
--
-- THE APPEND IS GONE, AND WITH IT A BUG. Both used to push an entry onto the
-- target's page2.profiles[] by hand, with no check for one already being there:
-- a four-find sequence reliably produced the same watcher twice, and the dock's
-- number and the visibility row both read that array's length. The list is
-- derived, so the relation existing IS the entry and a second one cannot be
-- written. Verified: twelve finds, then ten seeds run twice over — zero
-- duplicates, zero watchers holding two live relations.
--
-- app_seed_viewer's "nobody is looking at me" test gets exact rather than
-- approximate in the same move: it was jsonb_array_length(profiles) = 0, which
-- counted whatever the array held, ghosts and duplicates included, so a stale
-- entry could stop a real viewer being seeded. It counts live relations now.

CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row public.users; v_old uuid; v_excl uuid; v_inviter uuid;
  picked_id uuid; picked_dist int; picked_row public.users;
  result_user json; cand_ids uuid[]; cand_dists int[];
  la_row public.users; lookahead jsonb := '[]'::jsonb; i int; v_lapsed boolean;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT w.watcher_id INTO v_inviter FROM public.watch w
  WHERE w.target_id = me_id AND w.state='invited';

  SELECT w.target_id, (w.expires_at IS NULL OR w.expires_at <= now()) INTO v_excl, v_lapsed
  FROM public.watch w WHERE w.watcher_id = me_id AND w.state='watching';
  IF COALESCE(v_lapsed,false) THEN v_excl := NULL; END IF;

  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND (v_excl IS NULL OR o.user_id <> v_excl)
      AND (v_inviter IS NULL OR o.user_id <> v_inviter)
      AND NOT EXISTS (SELECT 1 FROM public.watch w
                      WHERE w.watcher_id = o.user_id AND w.target_id = me_id
                        AND w.state IN ('watching','invited'))
  ) c WHERE c.rn <= 3;

  picked_id := cand_ids[1]; picked_dist := cand_dists[1];

  SELECT w.target_id INTO v_old FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state='watching';

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, v_old, picked_id]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  UPDATE public.watch w SET state='ended', ended_at=now(),
    target_reason='expire', target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
  WHERE w.target_id = me_id AND w.state='invited' AND w.expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.watch w WHERE w.watcher_id = me_id AND w.state IN ('invited','chat')) THEN
    PERFORM public._watch_project(ARRAY[me_id]);
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb, 'lookahead','[]'::jsonb);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF NOT picked_row.discoverable
       OR EXISTS (SELECT 1 FROM public.watch w WHERE w.target_id = picked_id AND w.state IN ('invited','chat'))
       OR EXISTS (SELECT 1 FROM public.watch w WHERE w.watcher_id = picked_id AND w.state='chat') THEN
      picked_id := NULL;
    END IF;
  END IF;

  UPDATE public.watch w SET state='ended', ended_at=now(),
    watcher_reason=NULL, watcher_slot_at=NULL, updated_at=now()
  WHERE w.watcher_id = me_id AND w.state='watching';

  IF picked_id IS NULL THEN
    UPDATE public.users SET seeking = true WHERE user_id = me_id AND NOT seeking;
  ELSE
    INSERT INTO public.watch (watcher_id, target_id, state, expires_at, watcher_slot_at, target_slot_at)
    VALUES (me_id, picked_id, 'watching', now() + public._watch_ttl(), now(), now())
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state='watching', expires_at=now() + public._watch_ttl(),
      ended_at=NULL, watcher_reason=NULL, watcher_cleared_at=NULL,
      invited_at=NULL, extended=false,
      watcher_slot_at=now(), target_slot_at=now(), updated_at=now();
  END IF;

  PERFORM public._watch_project(ARRAY[me_id, v_old, picked_id]);

  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids,1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead := lookahead || jsonb_build_array(public.make_profile(la_row, cand_dists[i], me_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb, 'lookahead', lookahead);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_seed_viewer(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row public.users; cand_id uuid; cand_dist int; cand_row public.users;
  cur_p1 uuid; result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  IF COALESCE(me_row.relations->'availability'->>'state','available') <> 'available'
     OR NOT me_row.discoverable
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE (w.watcher_id = me_id OR w.target_id = me_id) AND w.state='chat')
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE w.target_id = me_id AND w.state IN ('watching','invited')) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  SELECT w.target_id INTO cur_p1 FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state IN ('watching','invited');

  SELECT o.user_id, o.distance INTO cand_id, cand_dist
  FROM public.others(me_row, true) o
  WHERE o.relevance > 0
    AND (cur_p1 IS NULL OR o.user_id <> cur_p1)
    AND NOT EXISTS (SELECT 1 FROM public.watch w
                    WHERE w.watcher_id = o.user_id AND w.state IN ('watching','invited','chat'))
  ORDER BY o.relevance DESC LIMIT 1;

  IF cand_id IS NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, cand_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;

  IF NOT FOUND
     OR COALESCE(me_row.relations->'availability'->>'state','available') <> 'available'
     OR NOT me_row.discoverable
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE (w.watcher_id = me_id OR w.target_id = me_id) AND w.state='chat')
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE w.target_id = me_id AND w.state IN ('watching','invited'))
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE w.watcher_id = cand_id AND w.state IN ('watching','invited','chat'))
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE w.watcher_id = me_id AND w.target_id = cand_id
                  AND w.state IN ('watching','invited','chat')) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  INSERT INTO public.watch (watcher_id, target_id, state, expires_at, watcher_slot_at, target_slot_at)
  VALUES (cand_id, me_id, 'watching', now() + public._watch_ttl(), now(), now())
  ON CONFLICT (watcher_id, target_id) DO UPDATE SET
    state='watching', expires_at=now() + public._watch_ttl(),
    ended_at=NULL, watcher_reason=NULL, watcher_cleared_at=NULL,
    invited_at=NULL, extended=false,
    watcher_slot_at=now(), target_slot_at=now(), updated_at=now();

  PERFORM public._watch_project(ARRAY[me_id, cand_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', cand_id::text, 'code','candidate','actor_id', me_id::text)));
END;
$function$;
