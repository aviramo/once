-- Broadcasting users accept invitations for free.
--
-- User decision (2026-05-18): "whoever, while in broadcast mode, receives an
-- invitation does not need to pay a star. No stars are used when someone
-- invites you."
--
-- A broadcast costs 2 stars up front (app_add). While the 30-minute broadcast
-- window is still open the user is being actively shown to people, so the
-- whole point is to *receive* invitations -- charging the standard 1-star
-- approve cost on top of the 2 already spent would punish exactly the action
-- broadcasting exists to produce. So: app_approve costs 0 when the approver
-- is currently broadcasting.
--
-- Consequence handled here too: the others() findability gate drops anyone
-- whose balance < cost('approve') so nobody is shown a user who can't accept.
-- A user who broadcast with their last 2 stars sits at balance 0 and would
-- become invisible *during their own broadcast* -- self-defeating. So a
-- broadcasting candidate bypasses the balance gate (their approve is free).
--
-- The 30-minute broadcast-window predicate
--   NULLIF(relations->>'last_add_at','')::timestamptz > now() - interval '30 minutes'
-- is the SAME window inlined in app_add / app_cancel_add / app_lock2 /
-- others.relevance_broadcast. It MUST stay in lockstep with all of them (the
-- codebase deliberately inlines this interval rather than extracting it -- see
-- CLAUDE.md "Credits economy" / "Broadcast relevance boost"). This migration
-- adds two more inline sites: app_approve and the others() credits clause.
--
-- Additive / not breaking for the deployed mobile app: app_approve's response
-- shape is unchanged; an older client merely renders the static "1" cost badge
-- while the server charges 0 (cosmetic, self-corrects on app update). others()
-- is internal-only (no output column changed).

-- ── app_approve: cost 0 while the approver is broadcasting ─────────────────

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
  me_credits    jsonb;
  v_approve_cost int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  inviter_id    := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  my_old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id IN (me_id, inviter_id)
     OR (my_old_target IS NOT NULL AND user_id = my_old_target)
     OR relations->'page1'->'profile'->>'user_id' IN (me_id::text, inviter_id::text)
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  -- Effective credits for me: if I had an outgoing invite (page1='waiting')
  -- it is abandoned by matching here (NOT a self-cancel) → refund that hold
  -- first, then pay the approve cost.
  me_credits := CASE WHEN me_row.relations->'page1'->>'state' = 'waiting'
                     THEN public._credits_refund(me_row.relations)
                     ELSE me_row.relations END;

  -- Broadcasting → accepting is free (the user already paid 2 to broadcast).
  -- Same 30-minute window as app_add / others.relevance_broadcast; keep these
  -- in lockstep (see CLAUDE.md "Credits economy" / "Broadcast relevance boost").
  v_approve_cost := CASE
    WHEN COALESCE(
           NULLIF(me_row.relations->>'last_add_at','')::timestamptz
             > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_balance(me_credits) < v_approve_cost THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'approve')
    ) WHERE user_id = me_id;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = inviter_id;

  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_profiles(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  -- me: chat + page2 cleared. Keep credits: refund my own abandoned invite
  -- (already folded into me_credits) then charge the approve cost (0 while
  -- broadcasting, consumed otherwise).
  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_credits, v_approve_cost, false)->'credits'
  ) WHERE user_id = me_id;

  -- inviter: chat + page2 cleared. The inviter's invite to me is accepted →
  -- the held credit is consumed (no refund), balance preserved.
  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_clear_hold(relations)->'credits'
  ) WHERE user_id = inviter_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, inviter_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;
  FOR kicked IN SELECT * FROM public._kick_page1_at(inviter_id, me_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'match'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;

-- ── others(): a broadcasting candidate bypasses the balance gate ───────────
-- Signature/return type unchanged → CREATE OR REPLACE is safe (no DROP).

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH relations AS (
  SELECT
    other.user_id,
    row_to_json(other) "user",
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int AS distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dist_meters,
    other.range AS other_range,
    1::double precision relevance_gender,
    1::double precision relevance_restriction,
    (CASE WHEN (me).age_from = (me).age_to
      THEN CASE WHEN EXTRACT(year FROM age(other.birth_date)) = (me).age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age(other.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    END)
    *
    (CASE WHEN other.age_from = other.age_to
      THEN CASE WHEN EXTRACT(year FROM age((me).birth_date)) = other.age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age((me).birth_date)) - (other.age_from + other.age_to) / 2.0) / ((other.age_to - other.age_from) / 2.0))
    END) relevance_age,
    GREATEST(0.0, 1 - (EXTRACT(epoch FROM (now() - other.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) relevance_time,
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(other.relations->'page2'->'profiles'), 0)) / 5.0) relevance_watchers,
    public.schedule_overlap((me).data, other.data) relevance_schedule,
    public.kids_preference_match((me).data, other.data) relevance_kids,
    (CASE
      WHEN NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) relevance_broadcast
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND (
      LEAST((me).range, other.range) IS NULL
      OR (me).location IS NULL
      OR other.location IS NULL
      OR extensions.st_dwithin(
        (me).location::extensions.geography,
        other.location::extensions.geography,
        LEAST((me).range, other.range)
      )
    )
    AND (
      ((me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_male) OR
      ((me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_male) OR
      (NOT (me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_female) OR
      (NOT (me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_female)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.restrictions r
      WHERE ((r.user_id = (me).user_id AND r.other_id = other.user_id)
          OR (r.other_id = (me).user_id AND r.user_id = other.user_id))
        AND ((r.key IN ('ignore', 'cancel', 'remove') AND r.created_at > now() - interval '1 day')
          OR (r.key = 'decline' AND r.created_at > now() - interval '7 days')
          OR (r.key = 'leave'   AND r.created_at > now() - interval '14 days')
          OR r.key = 'block')
    )
    AND NOT (
      jsonb_typeof((me).data->'family'->'isForKids') = 'boolean'
      AND jsonb_typeof(other.data->'family'->'isForKids') = 'boolean'
      AND ((me).data->'family'->>'isForKids')::bool IS DISTINCT FROM (other.data->'family'->>'isForKids')::bool
    )
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND COALESCE(other.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending')
      )
    )
    AND (
      NOT only_available
      OR public.area_available(other.location::extensions.geography)
    )
    AND (
      NOT only_available
      -- A broadcasting user accepts for free → don't gate them on balance,
      -- or they'd vanish from the pool during their own paid broadcast.
      -- Same 30-minute window as relevance_broadcast above (keep in lockstep).
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR COALESCE((other.relations->'credits'->>'balance')::numeric, 0) >= public._credits_cost('approve')
    )
)
SELECT
  user_id,
  "user",
  distance,
  relevance_gender,
  relevance_restriction,
  relevance_age,
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END) relevance_location,
  relevance_time,
  relevance_watchers,
  relevance_schedule,
  relevance_kids,
  relevance_broadcast,
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast relevance
FROM relations
$function$;
