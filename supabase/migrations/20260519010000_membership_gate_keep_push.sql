-- ============================================================================
-- Fix-forward: the group_membership_gate migration wholesale-replaced
-- user_availability and accidentally dropped the push_blocked
-- (notification-presence gate, migration 20260518060000_push_presence_gate)
-- case — an UNRELATED feature that must survive the membership-gate change.
--
-- others() still carries its push_blocked clause (preserved in
-- group_membership_gate), so push-gated users were still excluded from match
-- pools; but the symmetric edge-handler initiation block + the user's own gate
-- UI key off relations.availability.state, which (without this fix) ignored
-- push_blocked — so a push-denied user who happened to be in an active group
-- would wrongly read 'available' and could initiate find/invite.
--
-- Correct precedence (both features intact):
--   1. push_blocked(uid)      -> unavailable  (notification-presence gate;
--      push_blocked is FALSE when location IS NULL, so onboarding is safe).
--   2. loc IS NULL            -> available    (onboarding / pre-permission).
--   3. in_enabled_group(uid)  -> available    (USER RULE 2026-05-19: member of
--                                              >=1 ENABLED group).
--   4. otherwise              -> unavailable  (no active group = disabled).
-- group_blocked / area_state remain intentionally absent (the membership rule
-- subsumes "disabled group = no access"; geo no longer gates).
-- Additive / not breaking (mobile reads only availability.state).
-- ============================================================================

create or replace function public.user_availability(uid uuid, loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable')
    when loc is null
      then jsonb_build_object('state', 'available')
    when public.in_enabled_group(uid)
      then jsonb_build_object('state', 'available')
    else jsonb_build_object('state', 'unavailable')
  end
$$;
