-- The watch model: slot stamps, the two account flags, and the projection.
--
-- CONSOLIDATED. Applied live on 2026-08-02 as eight migrations (versions
-- 20260802005353 through 20260802011212) that were a sequence of corrections to
-- one design, each forced by a diff against live data. Only the end state
-- matters to a replay, so it is stated once here. What the corrections were,
-- because each is a trap worth not re-entering:
--
--   * a snapshot column was added, then dropped, then re-added as a FALLBACK.
--     page1.profile looks like a picture taken at write time and is not:
--     app_refresh_snapshots rebuilds it wholesale on every call, so a stored
--     copy goes stale within minutes (measured: four). But it cannot be rebuilt
--     once the counterpart's account is deleted, and live data has exactly that.
--     So: derive while they exist, fall back to the last known when they do not.
--   * jsonb_strip_nulls is RECURSIVE. Used on the board object it reached down
--     into the profile snapshot and removed that snapshot's own null-valued
--     keys, quietly lightening twelve boards.
--   * `cleared` was carrying two different facts — "this message was dismissed"
--     and "this row is not on my board at all" — and they came apart at once on
--     live data. The slot stamps below are the second fact; the clear stamps
--     kept only the first.
--
-- Proven against every live board, in-transaction so the clock could not drift:
-- page1 84/84 identical, page2 83/84, and the single remaining difference is a
-- stale viewer entry the projection deliberately drops (see the backfill note).
--
-- NOTHING CALLS ANY OF THIS YET. No trigger exists; relations are still authored
-- by the RPCs. The projection becomes live only when the writers are converted.

-- ── slot stamps ────────────────────────────────────────────────────────────
-- Each board is one slot. The row holding it is the one with the newest stamp
-- for that side, so the slot is derived and cannot drift — no boolean anyone
-- has to remember to unset.
ALTER TABLE public.watch
  ADD COLUMN IF NOT EXISTS watcher_slot_at      timestamptz,
  ADD COLUMN IF NOT EXISTS target_slot_at       timestamptz,
  -- last known, for a counterpart whose account is gone
  ADD COLUMN IF NOT EXISTS watcher_profile_last jsonb,
  ADD COLUMN IF NOT EXISTS target_profile_last  jsonb;

-- ── the two facts that belong to an ACCOUNT, not to a relation ─────────────
-- "page1 free vs locked with nothing on it" is whether the server may seed me
-- somebody; "page2 locked with no message" is whether I am shown to anyone.
-- Folding them into the boards is what made page2 mean both "who is looking at
-- me" and "am I hidden". They carry no page vocabulary: the boards are going
-- away and their names must not outlive them.
--
-- users.is_visible is NOT reused: zero references in any function or in the app,
-- so its values are of unknown age. It stays dead and is dropped separately.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS seeking      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true;

UPDATE public.users
SET seeking      = (COALESCE(relations->'page1'->>'state','free') = 'free'),
    discoverable = public._page2_open(relations->'page2')
WHERE user_id IS NOT NULL;

-- ── backfill ───────────────────────────────────────────────────────────────
-- page1 is the TRUTH for who is watching whom: it is the watcher's own state,
-- written by his own action. page2.profiles[] is the mirror of it, and where the
-- two disagree the mirror is the stale one — live, one real user was still filed
-- as a viewer of another real user three weeks after she stopped, her whole
-- profile with her. The ghost is NOT resurrected here; the backfill is where it
-- dies. (The leak is _expire_watch_one, whose detach-the-other-side half is
-- conditional on `p_target IS NOT NULL`.)
DELETE FROM public.watch WHERE watcher_id IS NOT NULL;

INSERT INTO public.watch (
  watcher_id, target_id, state, invited_at, expires_at, extended,
  ended_at, ended_reason, watcher_cleared_at, watcher_slot_at, target_slot_at, target_profile_last)
SELECT u.user_id, (u.relations->'page1'->'profile'->>'user_id')::uuid,
  CASE u.relations->'page1'->>'state'
    WHEN 'watching' THEN 'watching' WHEN 'waiting' THEN 'invited'
    WHEN 'chat' THEN 'chat' ELSE 'ended' END,
  NULLIF(u.relations->'page1'->>'invited_at','')::timestamptz,
  NULLIF(u.relations->'page1'->>'expires_at','')::timestamptz,
  COALESCE((u.relations->'page1'->>'extended')::boolean, false),
  CASE WHEN u.relations->'page1'->>'state' = 'locked' THEN now() END,
  CASE WHEN u.relations->'page1'->>'state' = 'locked' THEN NULLIF(u.relations->'page1'->>'message','') END,
  -- locked WITH a profile and NO message is the post-clear1 shape: still on the
  -- board, message already dismissed.
  CASE WHEN u.relations->'page1'->>'state' = 'locked'
        AND NULLIF(u.relations->'page1'->>'message','') IS NULL THEN now() END,
  now(),
  CASE WHEN u.relations->'page1'->>'state' IN ('watching','waiting','chat') THEN now() END,
  u.relations->'page1'->'profile'
FROM public.users u
WHERE u.relations->'page1' ? 'profile'
  AND (u.relations->'page1'->'profile'->>'user_id')::uuid IS DISTINCT FROM u.user_id
ON CONFLICT (watcher_id, target_id) DO NOTHING;

-- The inbound "it ended" messages that no page1 explains. Live, that was ALL
-- NINE of them — the two boards are not two views of one relation, they are two
-- independent single-slot mailboxes, and either can be overwritten while the
-- other still stands. One of the nine names an account that no longer exists,
-- which is why this table carries no foreign key.
INSERT INTO public.watch (
  watcher_id, target_id, state, ended_at, ended_reason, target_slot_at, watcher_profile_last)
SELECT (u.relations->'page2'->'profile'->>'user_id')::uuid, u.user_id, 'ended', now(),
       NULLIF(u.relations->'page2'->>'message',''), now(), u.relations->'page2'->'profile'
FROM public.users u
WHERE u.relations->'page2'->>'state' = 'locked'
  AND u.relations->'page2' ? 'message'
  AND (u.relations->'page2'->'profile'->>'user_id')::uuid IS DISTINCT FROM u.user_id
ON CONFLICT (watcher_id, target_id) DO NOTHING;

-- A pending invitation the inviter's own page1 does not state. Zero of these
-- live; the clause exists so the backfill is complete rather than lucky.
INSERT INTO public.watch (
  watcher_id, target_id, state, invited_at, expires_at, extended,
  watcher_slot_at, target_slot_at, watcher_profile_last)
SELECT (u.relations->'page2'->'profile'->>'user_id')::uuid, u.user_id, 'invited',
  COALESCE(NULLIF(u.relations->'page2'->>'invited_at','')::timestamptz, now()),
  COALESCE(NULLIF(u.relations->'page2'->>'expires_at','')::timestamptz, now()),
  COALESCE((u.relations->'page2'->>'extended')::boolean, false),
  now(), now(), u.relations->'page2'->'profile'
FROM public.users u
WHERE u.relations->'page2'->>'state' = 'pending'
  AND (u.relations->'page2'->'profile'->>'user_id')::uuid IS DISTINCT FROM u.user_id
ON CONFLICT (watcher_id, target_id) DO NOTHING;

-- ── the projection ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public._watch_profile(uuid, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public._watch_pages(uuid, boolean, boolean);

-- Profiles are built the way app_refresh_snapshots builds them, verbatim: the
-- single-counterpart slots pass viewer_id (3-arg make_profile) so the snapshot
-- carries the shared-circle chip, viewer-LIST entries pass two args on purpose
-- and carry none, `chat` strips `distance`, and a NULL location on either side
-- means a NULL distance rather than a zero.
CREATE OR REPLACE FUNCTION public._watch_profile(
  p_of uuid, p_viewer uuid, p_chat boolean, p_listed boolean, p_last jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  subject public.users;
  viewer  public.users;
  dist    int;
  prof    jsonb;
BEGIN
  SELECT * INTO subject FROM public.users WHERE user_id = p_of;
  IF NOT FOUND THEN RETURN p_last; END IF;
  SELECT * INTO viewer FROM public.users WHERE user_id = p_viewer;

  dist := CASE
    WHEN viewer.location IS NULL OR subject.location IS NULL THEN NULL
    ELSE extensions.st_distance(viewer.location::extensions.geography,
                                subject.location::extensions.geography)::int
  END;

  prof := CASE WHEN p_listed
               THEN public.make_profile(subject, dist)
               ELSE public.make_profile(subject, dist, p_viewer) END;

  IF p_chat THEN prof := prof - 'distance'; END IF;
  RETURN prof;
END;
$function$;

CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me     public.users;
  slot   public.watch;
  inv    public.watch;
  page1  jsonb;
  page2  jsonb;
  views  jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id = p_user AND w.watcher_slot_at IS NOT NULL
  ORDER BY w.watcher_slot_at DESC LIMIT 1;

  IF NOT FOUND THEN
    page1 := jsonb_build_object('state', CASE WHEN me.seeking THEN 'free' ELSE 'locked' END);
  ELSE
    page1 := jsonb_build_object(
      'state', CASE slot.state WHEN 'invited' THEN 'waiting' WHEN 'ended' THEN 'locked' ELSE slot.state END,
      'profile', public._watch_profile(slot.target_id, p_user, slot.state = 'chat', false, slot.target_profile_last));

    IF slot.state = 'watching' AND slot.expires_at IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('expires_at', slot.expires_at);
    ELSIF slot.state = 'invited' THEN
      page1 := page1
        || CASE WHEN slot.invited_at IS NOT NULL THEN jsonb_build_object('invited_at', slot.invited_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.expires_at IS NOT NULL THEN jsonb_build_object('expires_at', slot.expires_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.extended THEN jsonb_build_object('extended', true) ELSE '{}'::jsonb END;
    ELSIF slot.state = 'ended' AND slot.watcher_cleared_at IS NULL AND slot.ended_reason IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('message', slot.ended_reason);
    END IF;
  END IF;

  SELECT * INTO inv FROM public.watch w
  WHERE w.target_id = p_user AND w.state IN ('invited', 'chat') LIMIT 1;

  IF FOUND AND inv.state = 'invited' THEN
    page2 := jsonb_build_object('state', 'pending',
      'profile', public._watch_profile(inv.watcher_id, p_user, false, false, inv.watcher_profile_last))
      || CASE WHEN inv.invited_at IS NOT NULL THEN jsonb_build_object('invited_at', inv.invited_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.expires_at IS NOT NULL THEN jsonb_build_object('expires_at', inv.expires_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.extended THEN jsonb_build_object('extended', true) ELSE '{}'::jsonb END;
    RETURN jsonb_build_object('page1', page1, 'page2', page2);
  ELSIF FOUND THEN
    -- a chat takes both of us off the board entirely
    RETURN jsonb_build_object('page1', page1, 'page2', jsonb_build_object('state', 'locked'));
  END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.target_id = p_user AND w.target_slot_at IS NOT NULL AND w.state = 'ended'
  ORDER BY w.target_slot_at DESC LIMIT 1;

  IF FOUND AND slot.target_cleared_at IS NULL AND slot.ended_reason IS NOT NULL THEN
    page2 := jsonb_build_object('state', 'locked', 'message', slot.ended_reason,
      'profile', public._watch_profile(slot.watcher_id, p_user, false, false, slot.watcher_profile_last),
      'profiles', '[]'::jsonb);
  ELSIF NOT me.discoverable THEN
    page2 := jsonb_build_object('state', 'locked');
  ELSE
    SELECT COALESCE(jsonb_agg(public._watch_profile(w.watcher_id, p_user, false, true, w.watcher_profile_last)
                              ORDER BY w.created_at), '[]'::jsonb)
    INTO views
    FROM public.watch w
    WHERE w.target_id = p_user AND w.state = 'watching'
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = w.watcher_id);
    page2 := jsonb_build_object('state', 'free', 'profiles', views);
  END IF;

  RETURN jsonb_build_object('page1', page1, 'page2', page2);
END;
$function$;

REVOKE ALL ON FUNCTION public._watch_profile(uuid, uuid, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._watch_pages(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_profile(uuid, uuid, boolean, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._watch_pages(uuid) TO service_role;
