-- 2026-07-30 — A FRIEND IS NOT A CANDIDATE; A FRIEND OF A FRIEND IS THE POINT.
--
-- User directive: "I am not supposed to see my own friends. Block it. The value
-- is the friends OF friends: I don't know them, but we have a mutual friend,
-- and that is the anchor for a new connection."
--
-- The friend edge was doing exactly the wrong thing in both halves of the game:
--
--   candidacy  a consented friend_links pair was an ordinary candidate, so the
--              two people who least need an introduction were offered each
--              other. They are now excluded outright, in the same WHERE block
--              that holds `restrictions` and `_group_hidden_pair` — absolute,
--              symmetric (one row per pair, canonical a<b), and enforced for
--              every consumer at once, since app_find / app_add /
--              app_seed_viewer all draw their candidates from others().
--
--   relevance  the x3 bump sat on that same direct pair (20260725160000). It
--              moves one hop out: a candidate I share a MUTUAL FRIEND with now
--              carries it. That is the person the chip already names on the card
--              ("חבר של אסף", _shared_friend_json), so the boost and the chip
--              finally point at the same person.
--
-- A shared GROUP is untouched — a group member is someone I plausibly have not
-- met — and keeps its own x3 in `relevance_group`.
--
-- Backward compatible for installed apps: the RETURN signature is byte-identical
-- (no column added, dropped or retyped), so app_find / app_add / app_seed_viewer
-- and every published build read exactly what they read before. What changes is
-- which rows come back and in what order, which no client version can break on.
-- No BACKWARD_COMPAT.md entry: nothing here is staged Expand→Contract.

-- Is this pair linked as friends? The canonical-order lookup others() used to
-- inline, hitting friend_links_pkey (a, b) directly.
CREATE OR REPLACE FUNCTION public._friend_pair(p_a uuid, p_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_links fl
    WHERE fl.a = LEAST(p_a, p_b) AND fl.b = GREATEST(p_a, p_b)
  )
$function$;

-- Do the two have a friend in common? The same predicate _shared_friend_json /
-- app_shared_friends already use to NAME and LIST those friends, asked as a
-- yes/no so the ranking and the chip can never disagree about who counts.
-- `c` cannot be either side: it is a friend of both, and there are no self
-- links. A direct pair is not excluded here — the candidacy clause above has
-- already removed it from the game, and outside the game (a person page opened
-- from a roster) "we also share Asaf" stays a true statement.
CREATE OR REPLACE FUNCTION public._friend_of_friend(p_a uuid, p_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.friend_links fa
    WHERE (fa.a = p_a OR fa.b = p_a)
      AND EXISTS (
        SELECT 1 FROM public.friend_links fb
        WHERE (fb.a = p_b AND fb.b = CASE WHEN fa.a = p_a THEN fa.b ELSE fa.a END)
           OR (fb.b = p_b AND fb.a = CASE WHEN fa.a = p_a THEN fa.b ELSE fa.a END)
      )
  )
$function$;

REVOKE ALL ON FUNCTION public._friend_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._friend_of_friend(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._friend_pair(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._friend_of_friend(uuid, uuid) TO service_role;

-- Every other candidacy clause and every other relevance factor is preserved
-- verbatim from the live body, per CLAUDE.md's others() cross-feature note.
CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance_group double precision, relevance double precision)
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
    END) relevance_broadcast,
    (CASE
      WHEN public._shared_group_name((me).user_id, other.user_id) IS NOT NULL
      THEN 3.0 ELSE 1.0
    END) relevance_group
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND other.is_test = COALESCE((me).is_test, false)
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
    -- A community you run is not a dating pool. When either side has hidden
    -- their membership in a group the two of them share, neither is ever
    -- offered the other. Symmetric by construction, so a manager who steps out
    -- of the game with their community steps out of it for both sides at once.
    AND NOT public._group_hidden_pair((me).user_id, other.user_id)
    -- Neither is a friend of mine a candidate (user directive 2026-07-30). We
    -- already know each other, so there is nothing here to introduce; what my
    -- friends are FOR is the people one hop past them, which the relevance
    -- factor at the bottom of this function is what rewards.
    AND NOT public._friend_pair((me).user_id, other.user_id)
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND public._page2_open(other.relations->'page2')
      )
    )
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    AND (
      NOT only_available
      OR (
        jsonb_typeof(other.data->'images') = 'array'
        AND jsonb_array_length(other.data->'images') >= 1
      )
    )
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    -- Around, not just reachable: a full day without opening the app and you are
    -- no longer shown to anyone. Same family as push_blocked above — the app
    -- requires presence, and an invitation only means something to someone who
    -- is still here to answer it.
    AND (
      NOT only_available
      OR other.last_seen > now() - public._presence_ttl()
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR (COALESCE((other.relations->'credits'->>'balance')::numeric, 0)
        + COALESCE((other.relations->'credits'->>'extra')::numeric,   0))
        >= public._credits_cost('approve')
      OR (other.relations->'credits'->>'unpaid_at') IS NULL
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
  relevance_group,
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast * relevance_group
  -- A mutual friend is the anchor (user directive 2026-07-30): a stranger we
  -- both know somebody in common with ranks like a fellow group member, and
  -- arrives with that person's name on the card. Was the DIRECT pair until
  -- today, which is now not a candidate at all.
  * (CASE WHEN public._friend_of_friend((me).user_id, user_id) THEN 3.0 ELSE 1.0 END) relevance
FROM relations
$function$;
