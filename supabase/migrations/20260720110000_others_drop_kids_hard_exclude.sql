-- The 2026-05-17 decision (migration kids_preference_match_rescale) rescaled a
-- mismatched isForKids pair from a hard 0.0 exclude to a 0.5 soft penalty:
--   "both set + different values -> 0.5 (soft penalty, no longer a hard exclude)"
-- but it only touched kids_preference_match. `others()` kept a SEPARATE hard
-- WHERE clause dropping those pairs before relevance is ever computed, so the
-- soft penalty has been dead code ever since and the decision never took
-- effect. Measured 2026-07-20 on the live pool: this clause alone cut one
-- user's candidates from 16 to 11.
--
-- Rewrite by textual excision of that single clause from the live body, with
-- an assertion that it matched exactly once -- safer than re-emitting the
-- whole 100-line function by hand.
do $$
declare
  v_def    text;
  v_clause text;
  v_new    text;
begin
  v_def := pg_get_functiondef('public.others(public.users, boolean)'::regprocedure);

  v_clause := '    AND NOT (
      jsonb_typeof((me).data->''family''->''isForKids'') = ''boolean''
      AND jsonb_typeof(other.data->''family''->''isForKids'') = ''boolean''
      AND ((me).data->''family''->>''isForKids'')::bool IS DISTINCT FROM (other.data->''family''->>''isForKids'')::bool
    )
';

  if position(v_clause in v_def) = 0 then
    raise exception 'others(): isForKids hard-exclude clause not found -- live body drifted, aborting';
  end if;

  v_new := replace(v_def, v_clause, '');

  if position(v_clause in v_new) <> 0 then
    raise exception 'others(): clause matched more than once, aborting';
  end if;

  execute v_new;
end $$;

-- One-time data repair: release every page2 parked at `locked` WITH a message.
--
-- That state is an UNREAD notification ("your invitation expired / was
-- cancelled"), not a hide -- the only real hide is `locked` with NO message
-- (app_lock2). But `others(only_available)` drops `locked` unconditionally, so
-- a user who never opened the app to tap "Continue" stayed out of the
-- discoverable pool indefinitely. That contradicts the documented
-- auto-return-to-free policy ("every page2 ending returns the user to the
-- discoverable pool without an extra step. Only app_lock2 keeps the user
-- out."). 12 of the 13 hidden users in the live pool were in this state, the
-- oldest since 2026-07-05.
--
-- This clears the backlog. It does NOT stop it recurring -- that needs a
-- decision on how a stale message card should expire (see CLAUDE.md).
select public.app_admin_release_page2(u.user_id)
  from public.users u
 where u.relations->'page2'->>'state' = 'locked'
   and u.relations->'page2'->>'message' is not null;
