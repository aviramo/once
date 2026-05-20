-- app_find: return up-to-2 look-ahead candidates for client image prefetch.
--
-- Why: every page1 skip = app/ignore -> app_find. The mobile client's felt
-- latency is dominated by waiting on Realtime to redeliver the next candidate
-- and then prefetching that candidate's photos on arrival. Returning the next
-- 1-2 ranked candidates here lets the client warm expo-image's disk cache
-- BEFORE the user skips, so the on-arrival prefetch is a cache hit.
--
-- The look-ahead users are a transport-only hint: they are NOT registered as
-- viewers (no page2.profiles[] write for them). Viewer semantics are
-- byte-identical to before — only the actually-picked candidate is attached
-- to its page2.profiles[], exactly as the prior version did.
--
-- Implementation: the single-pick `SELECT ... LIMIT 1` is replaced by one
-- top-3 capture from the SAME public.others(me_row, true) ranking (one
-- others() invocation, not two — mirrors app_add's array_agg+ROW_NUMBER
-- pattern). Row 1 is the pick (unchanged behavior); rows 2-3 become the
-- look-ahead, built with a fresh make_profile() from each candidate's current
-- row. Signature and the existing {user, notify} contract are unchanged; a new
-- `lookahead` key is ADDED to the returned jsonb. Old clients ignore it; the
-- edge handler forwards it only for find/ignore. Not breaking.
--
-- All other logic (lock ordering, lazy-expire of a stale incoming invite, the
-- page1 self-guard, detach-from-old-target, picked re-validation, the
-- no-candidate / candidate writes) is preserved verbatim from
-- 20260517140000_app_find_drop_page2_pending_guard.sql.

CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row         public.users;
  old_target     uuid;
  picked_id      uuid;
  picked_dist    int;
  picked_row     public.users;
  result_user    json;
  cur_state      text;
  cur_p2_state   text;
  cur_p2_inviter uuid;
  cand_ids       uuid[];
  cand_dists     int[];
  la_row         public.users;
  lookahead_json jsonb := '[]'::jsonb;
  i              int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  cur_p2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  -- Top-3 candidates from ONE others() ranking: row 1 = pick (unchanged),
  -- rows 2-3 = look-ahead prefetch hint. Same exclusions as the prior
  -- single-pick query.
  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
           OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
      AND (cur_p2_inviter IS NULL OR o.user_id <> cur_p2_inviter)
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' IN ('watching', 'waiting')
      )
  ) c
  WHERE c.rn <= 3;

  picked_id   := cand_ids[1];
  picked_dist := cand_dists[1];

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, picked_id]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  -- lazily expire a stale incoming invite so it can't permanently block find
  IF COALESCE(me_row.relations->'page2'->>'state', 'free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  -- page1 self-guard only. NO page2 clause: page1 (find) is independent of
  -- page2 (incoming invites) per the two-board model. A live page2.pending
  -- stays untouched on its own board; find proceeds on page1 and simply will
  -- not pick the inviter (excluded from the candidate pool above).
  IF cur_state NOT IN ('free', 'locked', 'watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', '[]'::jsonb);
  END IF;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF COALESCE(picked_row.relations->'page1'->>'state', 'free') = 'chat'
       OR COALESCE(picked_row.relations->'page2'->>'state', 'free') IN ('locked', 'pending') THEN
      picked_id := NULL;
    END IF;
  END IF;

  IF picked_id IS NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'free')
    ) WHERE user_id = me_id;
  ELSE
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object(
        'state', 'watching',
        'profile', public.make_profile(picked_row, picked_dist)
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(me_row, picked_dist))
    ) WHERE user_id = picked_id
      AND relations->'page2'->>'state' = 'free';
  END IF;

  -- Look-ahead: next up-to-2 ranked candidates (cand rows 2-3), built from
  -- their CURRENT row. Image-prefetch hint only — never written anywhere, not
  -- registered as viewers. Skips any equal to the final picked_id.
  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids, 1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead_json := lookahead_json || jsonb_build_array(public.make_profile(la_row, cand_dists[i]));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', lookahead_json);
END;
$function$;
