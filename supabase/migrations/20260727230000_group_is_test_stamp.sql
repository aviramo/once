-- Fix: an owner/manager could not approve a join request on their own group.
--
-- Symptom (2026-07-27, live): אסף (test account) tapped Approve on גיא's request
-- to join "בית ספר יסודי הרצל" twice; both calls returned 400 `no_request` from
-- app_respond_join and the requester stayed in the pending list forever. Same
-- for every other request on the seven demo groups seeded earlier that day.
--
-- Cause: `groups.is_test` (added 20260727120000) is stamped from the creator by
-- app_create_group and was backfilled from the owner for everything that existed
-- at the time. The demo groups were then inserted DIRECTLY into public.groups by
-- a seed, which never went through app_create_group, so `is_test` took the
-- column DEFAULT false while every owner and member is a test account. The
-- group landed on the real side of the partition with only test users inside it,
-- and app_respond_join's guard
--
--     IF p_accept AND v_group_test IS DISTINCT FROM public._is_test(v_requester)
--
-- correctly refused to pull a test user into a "real" group. The guard is right;
-- the stored flag was wrong. app_search_groups and app_redeem_invite read the
-- same flag, so those groups were also invisible to search and their invite
-- codes unredeemable for the very accounts that own them.
--
-- Fix is therefore two layers: restamp the wrong rows, then make the stamp
-- impossible to skip.

-- ── 1. Restamp ──────────────────────────────────────────────────────────────
-- Exactly the rule the 20260727120000 backfill used for owned groups: the
-- group's side is its owner's side. Only rows that actually disagree are
-- touched, in BOTH directions. The five legacy ownerless groups keep whatever
-- the member-based backfill decided -- there is no owner to read, and guessing
-- again would be the inference the column exists to avoid.
UPDATE public.groups g
   SET is_test = public._is_test(g.owner_id)
 WHERE g.owner_id IS NOT NULL
   AND g.is_test IS DISTINCT FROM public._is_test(g.owner_id);

-- ── 2. Stamp at the table, not at the RPC ───────────────────────────────────
-- app_create_group still passes _is_test(me_id) explicitly, which is fine and
-- now redundant. This trigger is what covers every OTHER writer -- a seed, an
-- admin fix-up, a future RPC -- so `is_test` can never again default itself onto
-- the wrong side of the partition. Mirrors groups_fill_invite_code, the BEFORE
-- INSERT trigger that already fills a derived column for any writer.
--
-- INSERT only, and only when an owner is present: an ownerless insert keeps the
-- value it was given, and a deliberate later UPDATE of the flag is still
-- possible (nothing in the app does one today).
CREATE OR REPLACE FUNCTION public._group_stamp_is_test()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    NEW.is_test := public._is_test(NEW.owner_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_stamp_is_test ON public.groups;
CREATE TRIGGER groups_stamp_is_test
  BEFORE INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public._group_stamp_is_test();
