-- ── A watch that ran out is not a watch, and not a rejection ────────────────
--
-- Expiry of a page1 `watching` card was INSTANT on the client (useLapsed in
-- home.tsx drops the card the second expires_at passes) and HOURLY on the
-- server (ext/watch -> app_expire_watch_sweep). Between the two there was a
-- window of up to 59 minutes in which the row read {state:'watching',
-- profile:{...}} in the DB while the app showed nothing but the play button.
--
-- A play press in that window made it worse instead of better: app_find took
-- its "already watching" branch, which keeps whoever sits in page1 OUT of the
-- draw. In a pool this size that regularly left no candidate at all, so page1
-- went to `free` -- "no one nearby", play button gone -- and the press read to
-- the user as doing nothing.
--
-- Three changes, all server-side, no wire shape touched:
--
--   1. _watch_lapsed(): one predicate for "this watch is over", asked by every
--      site that has to know. It also answers TRUE for a `watching` row with no
--      expires_at at all. Rows drawn before the expiry stamp
--      (20260723130000_watch_expiry_stamp) carry no clock, and `NULL <= now()`
--      is NULL rather than false, so the sweep's filter could never match them:
--      they were watching forever, their weeks-old snapshot was the only thing
--      their owner could see, and the "someone already watching me" exclusion
--      in app_find kept them out of their own target's pool permanently.
--
--   2. app_expire_self() also closes a lapsed watch, so start / location /
--      focus tear it down in the same round trip the client already renders as
--      gone. This is the lazy expiry invitations have had since
--      20260719140001_lazy_expire_invite; the watch simply never got its half.
--
--   3. app_find() stops excluding the page1 target once its clock has run out.
--      Expiry is not rejection: nobody was skipped, the hour just ended. Anyone
--      the user ACTUALLY turned down leaves a `restrictions` row (ignore /
--      cancel / remove / decline / leave / block) and others() filters those
--      bidirectionally, so nothing rejected can return through this door.

-- Has this page1 block stopped being a live watch? STABLE, not IMMUTABLE: it
-- reads now(). Single source for the sweep, the per-user lazy expiry and
-- app_find's exclusion, so the three can never drift apart.
CREATE OR REPLACE FUNCTION public._watch_lapsed(p_page1 jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(p_page1->>'state', 'free') = 'watching'
     AND COALESCE((p_page1->>'expires_at')::timestamptz <= now(), true)
$function$;

REVOKE ALL ON FUNCTION public._watch_lapsed(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_lapsed(jsonb) TO service_role;

-- Unchanged except for the predicate, which moves to _watch_lapsed so a
-- clockless legacy row is now reachable.
CREATE OR REPLACE FUNCTION public._expire_watch_one(p_watcher uuid, p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  did boolean := false;
BEGIN
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_watcher, p_target]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}', jsonb_build_object('state', 'locked')
  ) WHERE user_id = p_watcher
    AND public._watch_lapsed(relations->'page1')
    AND (p_target IS NULL OR relations->'page1'->'profile'->>'user_id' = p_target::text);
  IF FOUND THEN did := true; END IF;

  IF did AND p_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(p_target, p_watcher);
  END IF;

  RETURN did;
END;
$function$;

-- Same sweep, same cap, same order (a clockless row sorts last under NULLS
-- LAST, so timed rows keep their priority) -- only the filter widens.
CREATE OR REPLACE FUNCTION public.app_expire_watch_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  row_rec   record;
  processed int := 0;
  seen      int := 0;
  cap       int := 2000;
BEGIN
  FOR row_rec IN
    SELECT user_id, NULLIF(relations->'page1'->'profile'->>'user_id', '')::uuid AS target_id
    FROM public.users
    WHERE public._watch_lapsed(relations->'page1')
    ORDER BY (relations->'page1'->>'expires_at')::timestamptz ASC
    LIMIT cap
  LOOP
    seen := seen + 1;
    IF public._expire_watch_one(row_rec.user_id, row_rec.target_id) THEN
      processed := processed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('processed', processed, 'capped', seen >= cap);
END;
$function$;

-- The per-user lazy counterpart of the crons: whatever clock of MINE has run
-- out gets closed in the round trip I am already making. Gains the watch block;
-- the two invitation blocks are untouched. A watch expiry raises no
-- notification (nothing happened TO the user, their hour simply ended), so the
-- notify list stays empty for it -- same as the hourly sweep.
CREATE OR REPLACE FUNCTION public.app_expire_self(me_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row      public.users;
  notify      jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page1'->>'state' = 'waiting'
     AND (me_row.relations->'page1'->>'expires_at')::timestamptz <= now() THEN
    notify := notify || public._expire_invite_pair(
      me_id, NULLIF(me_row.relations->'page1'->'profile'->>'user_id', '')::uuid);
  END IF;

  IF me_row.relations->'page2'->>'state' = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    notify := notify || public._expire_invite_pair(
      NULLIF(me_row.relations->'page2'->'profile'->>'user_id', '')::uuid, me_id);
  END IF;

  IF public._watch_lapsed(me_row.relations->'page1') THEN
    PERFORM public._expire_watch_one(
      me_id, NULLIF(me_row.relations->'page1'->'profile'->>'user_id', '')::uuid);
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- Unchanged but for `excl_target`: the page1 occupant is kept out of the draw
-- only while the watch is LIVE.
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row         public.users;
  old_target     uuid;
  excl_target    uuid;
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

  -- Whoever is in page1 right now stays out of this draw: a skip must never
  -- re-offer the face that was just on screen. An EXPIRED watch is not a skip,
  -- so its occupant goes back into the pool like anyone else -- otherwise the
  -- one candidate the user was shown an hour ago is the one candidate they can
  -- never be shown again, and in a pool this size that is often the difference
  -- between a card and "no one nearby". Real rejections are held in
  -- `restrictions` (others() filters them both ways), not here.
  excl_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF public._watch_lapsed(me_row.relations->'page1') THEN
    excl_target := NULL;
  END IF;

  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND (excl_target IS NULL OR o.user_id <> excl_target)
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

  IF COALESCE(me_row.relations->'page2'->>'state', 'free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
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
       OR NOT public._page2_open(picked_row.relations->'page2') THEN
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
        'profile', public.make_profile(picked_row, picked_dist, me_id),
        'expires_at', now() + public._watch_ttl()
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public._slim_viewer(public.make_profile(me_row, picked_dist)))
    ) WHERE user_id = picked_id
      AND public._page2_open(relations->'page2');
  END IF;

  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids, 1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead_json := lookahead_json || jsonb_build_array(public.make_profile(la_row, cand_dists[i], me_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', lookahead_json);
END;
$function$;
