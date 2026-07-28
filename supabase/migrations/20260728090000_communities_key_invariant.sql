-- `relations.communities` kept disappearing. The reset RPCs were only one door
-- of three: `app_logout_cleanup` rebuilds relations from scratch on EVERY
-- logout —
--
--   UPDATE users SET relations = jsonb_set(
--     jsonb_build_object('page1', ..., 'page2', ...), '{credits}', ...)
--
-- — and `app_review_seed` inserts/updates the demo account the same way. Both
-- drop the denormalized communities summary, and it does not come back on its
-- own: the maintenance triggers fire on membership/friend/request changes, and
-- neither logging out nor signing back in is one. The user then lands on a hub
-- with nothing to paint and a menu row with no counts.
--
-- Wiping the game state on logout is CORRECT — page1/page2/credits are what
-- logout is for. The communities summary is not game state: it is derived from
-- user_groups / friend_links, which survive a logout untouched, so the summary
-- must survive with them.
--
-- Rather than patch the third writer and wait for a fourth, this makes the key
-- an INVARIANT of the table: a row can never be written without it. A brand-new
-- user gets it at INSERT too (empty lists rather than a missing key), so the
-- menu row says what it is for from the first launch instead of staying blank
-- until the first group join.
--
-- Cost is nil in steady state: the summary is only computed when the key is
-- absent, which after this is only a genuinely new row or a writer that just
-- tried to drop it.

CREATE OR REPLACE FUNCTION public._users_keep_communities()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.relations IS NULL OR NOT (NEW.relations ? 'communities') THEN
    NEW.relations := jsonb_set(
      coalesce(NEW.relations, '{}'::jsonb),
      '{communities}',
      public._communities_summary(NEW.user_id)
    );
  END IF;
  RETURN NEW;
END
$function$;

-- BEFORE, so it edits the row on its way in — no second UPDATE, no recursion
-- with _refresh_communities (which is itself an UPDATE of relations, and simply
-- finds the key already present).
DROP TRIGGER IF EXISTS users_keep_communities ON public.users;
CREATE TRIGGER users_keep_communities
BEFORE INSERT OR UPDATE OF relations ON public.users
FOR EACH ROW EXECUTE FUNCTION public._users_keep_communities();

-- Restore the accounts the logout path has stripped since the last backfill.
UPDATE public.users u
   SET relations = jsonb_set(coalesce(u.relations, '{}'::jsonb),
                             '{communities}',
                             public._communities_summary(u.user_id))
 WHERE NOT (coalesce(u.relations, '{}'::jsonb) ? 'communities');
