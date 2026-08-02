-- THE ROSTER IS LIVE (user directive 2026-08-02).
--
-- A circle's member list was the one list in the app that only ever changed
-- when you re-opened it: the roster is fetched on the page's mount and cached,
-- and the app's single Realtime channel is the caller's OWN users row. So a
-- member joining, leaving, being removed, being appointed an approver or being
-- handed the circle was invisible to every other device standing on that page.
--
-- The signal reaches the device through the channel it already has. Two facts
-- were missing from the denormalized summary that rides on it:
--
--   1. It only ever refreshed the person who MOVED. `_trg_comm_membership`
--      rewrote the joining/leaving user's own row and nobody else's -- while
--      the member COUNT it carries is a fact about the GROUP, held in every
--      member's summary. So "5 members" stayed 5 on everyone else's device,
--      indefinitely: nothing re-derives it (the count is stored, so a plain
--      fetch returns the stale copy too, and `_users_keep_communities` only
--      recomputes a row whose summary is of an older SHAPE).
--
--   2. It carried nothing that changes when only a ROLE does. Appointing or
--      unappointing an approver leaves the count and the owner untouched, so
--      even a fully fanned-out summary would have been byte-identical and no
--      client could tell it had to ask again. `groups.roster_rev` is that
--      missing fact: one counter, bumped by every change to who stands in the
--      circle and what they are to it, carried in the brief the client already
--      reads.
--
-- Deliberately NOT a second Realtime subscription on `user_groups` /
-- `group_managers`: those tables are readable only by admins (RLS), and
-- postgres_changes enforces RLS, so a member would receive nothing. Opening
-- them up would put the membership tables on PostgREST for every authenticated
-- client -- a new direct-DB surface for data the edge function already gates.
-- The fan-out costs one users-row write per member per change, and circles are
-- neighbourhood-sized (avg 6, largest 14 today).

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS roster_rev bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.groups.roster_rev IS
  'Bumped by every change to who is in this circle and what they are to it '
  '(join, leave, removal, appointment, unappointment, handover). Carried in '
  'the communities summary so an open roster knows to re-read itself.';

-- ── The brief every client reads ───────────────────────────────────────────
-- Additive on both: a published build that does not know the field ignores it
-- and keeps the mount-time fetch it has always had.

CREATE OR REPLACE FUNCTION public._group_brief_json(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
    'link', g.link,
    'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
    'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
    'roster_rev', g.roster_rev,
    'owner', public._group_owner_json(g.owner_id)
  )
  FROM public.groups g
  WHERE g.id = p_group_id;
$function$;

CREATE OR REPLACE FUNCTION public._owned_group_json(uid uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
    'requires_approval', g.requires_approval, 'description', g.description,
    'link', g.link,
    'is_owner', (g.owner_id = uid),
    'hidden', coalesce((SELECT ug.hidden FROM public.user_groups ug
                         WHERE ug.group_id = g.id AND ug.user_id = uid), false),
    'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
    'roster_rev', g.roster_rev,
    'pending', (SELECT count(*) FROM public.group_join_requests jr
                 WHERE jr.group_id = g.id AND jr.status = 'pending')
  )
  FROM public.groups g
  WHERE g.id = p_group_id
$function$;

-- ── Who gets told ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._trg_comm_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE gid uuid; uid uuid;
BEGIN
  gid := COALESCE(NEW.group_id, OLD.group_id);
  uid := COALESCE(NEW.user_id, OLD.user_id);
  -- The circle's people are not what every member is holding any more. Bumped
  -- HERE rather than from a trigger of its own, so the new value is on the row
  -- before the summaries below are built off it -- trigger firing order is
  -- alphabetical by name, which is not a thing to hang correctness on.
  -- `roster_rev` is not in comm_groups_upd's column list, so this cannot
  -- re-enter through the groups trigger.
  UPDATE public.groups SET roster_rev = roster_rev + 1 WHERE id = gid;
  -- EVERY member, not just the one who moved: the count and the revision are
  -- facts about the group, and each of them is carried in each member's own
  -- summary. This is the write that fans out over Realtime.
  PERFORM public._refresh_communities(ug.user_id)
    FROM public.user_groups ug WHERE ug.group_id = gid AND ug.user_id <> uid;
  -- ...and the person himself, who may have just stopped being one of them and
  -- so would not be found by the query above.
  PERFORM public._refresh_communities(uid);
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public._trg_comm_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.owner_id IS NOT NULL THEN PERFORM public._refresh_communities(OLD.owner_id); END IF;
    RETURN NULL;
  END IF;
  -- The crown moved. That is a change to WHO STANDS WHERE in the circle, not
  -- just to what the circle says about itself, so the roster's revision moves
  -- with it -- an open roster is showing a crown on the wrong row until it
  -- re-reads. (A handover also rewrites group_managers, which would bump it
  -- through the trigger above; stating it here is what makes the rule true of
  -- the owner_id column itself rather than true by side effect.)
  IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
    UPDATE public.groups SET roster_rev = roster_rev + 1 WHERE id = NEW.id;
  END IF;
  PERFORM public._refresh_communities(ug.user_id) FROM public.user_groups ug WHERE ug.group_id = NEW.id;
  RETURN NULL;
END $function$;

-- ...and the handover reaches that trigger at all: owner_id was not in the
-- column list, so a circle changing hands refreshed only the two people
-- involved and every other member kept the old owner under the group's name.
DROP TRIGGER IF EXISTS comm_groups_upd ON public.groups;
CREATE TRIGGER comm_groups_upd
  AFTER UPDATE OF name, is_public, description, link, owner_id ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_group();

-- ── The summary's shape moved: v4 -> v5 ────────────────────────────────────
-- Every brief carries one more field, so rows written under the old shape are
-- recomputed the next time anything writes them (_users_keep_communities), and
-- any roster change recomputes them for the whole circle there and then. No
-- bulk backfill: a client that has not been told a revision yet simply behaves
-- as it does today until the first change arrives, which is the moment the
-- field starts mattering.

CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    'v', 5,
    'managed', coalesce((
      SELECT jsonb_agg(public._owned_group_json(uid, g.id)
                       ORDER BY (g.owner_id = uid) DESC, g.created_at DESC)
      FROM public.groups g
      WHERE g.owner_id = uid
         OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'joined', coalesce((
      SELECT jsonb_agg(public._group_brief_json(g.id) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(public._group_brief_json(g.id) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'link', g.link,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
        'owner', public._group_owner_json(g.owner_id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

CREATE OR REPLACE FUNCTION public._users_keep_communities()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.relations IS NULL
     OR NOT (NEW.relations ? 'communities')
     OR (NEW.relations->'communities'->>'v') IS DISTINCT FROM '5'
  THEN
    NEW.relations := jsonb_set(
      coalesce(NEW.relations, '{}'::jsonb),
      '{communities}',
      public._communities_summary(NEW.user_id)
    );
  END IF;
  RETURN NEW;
END
$function$;
