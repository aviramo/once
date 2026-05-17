-- app_find: drop the blanket `OR cur_p2_state = 'pending'` early-return.
--
-- Bug: a user with a LIVE incoming invite (page2.state = 'pending', not yet
-- expired) who pressed the page1 Play button got app_find returning the user
-- UNCHANGED — no candidate picked, page1 stayed 'locked', so no relations
-- write and no Realtime event. The mobile client set searching=true and span
-- on "scanning people near you" forever. It also produced the "Play only works
-- on the second press" report: the first press hit this guard while the invite
-- was still live; a later press only worked because the invite had meanwhile
-- expired (cron expire-sweep / the lazy-expire branch below cleared
-- page2.pending) so cur_p2_state was no longer 'pending'.
--
-- This contradicts the two-board independence model: page1 (find) and page2
-- (incoming invites) are independent boards — a user "can be waiting on an
-- invitation they sent (page1) while also receiving a competing invitation
-- from someone else (page2)". The page1 Play button must work regardless of
-- page2 state.
--
-- The original guard's stated concern ("a user with a live incoming invite
-- could call /app/find and land their inviter back into page1 as 'watching',
-- producing the same user in both pages") is ALREADY handled independently by
-- the candidate-pool exclusions kept below: the pending inviter (cur_p2_inviter)
-- is excluded, and anyone pointing at me with page1 in (watching, waiting) is
-- excluded. So removing the blanket bail does not reintroduce the dup-user
-- case. The lazy-expire of a stale (expired) pending is preserved.
--
-- Net change vs. live: the precondition keeps `cur_state NOT IN ('free',
-- 'locked', 'watching')` (the legitimate page1 self-guard — don't run find
-- mid-waiting/chat) and DROPS `OR cur_p2_state = 'pending'`. Output contract
-- ({user, notify}) is unchanged; not breaking for any deployed client.

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
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  cur_p2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  SELECT o.user_id, o.distance INTO picked_id, picked_dist
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
  ORDER BY o.relevance DESC
  LIMIT 1;

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
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
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

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;
