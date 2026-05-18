-- ============================================================================
-- Report action — required for the PUBLIC store launch (Apple Guideline 1.2 /
-- Google UGC policy: a social/dating app open to the public MUST let users
-- report another user, block abusive users, and let the operator act on
-- reports within 24h). Block already exists (app_block); this adds the
-- missing report + a moderation record.
--
-- public.reports — one row per report. Plain uuid columns with NO FK (mirrors
--   the public.restrictions pattern exactly) so a moderation record survives
--   even if a user later deletes their account. RLS enabled, NO policies →
--   service-role only (edge function + web admin), same as areas / groups /
--   restrictions.
--
-- public.app_report(me_id, reported_id, p_reason, p_note) — single
--   transaction (SELECT ... FOR UPDATE ordered by user_id, like app_block):
--     1. record the report (always, regardless of relation state — a report
--        must never be lost),
--     2. insert a PERMANENT 'block' restriction reporter→reported (others()
--        already treats key='block' as permanent & bidirectional, so the pair
--        can never be matched again),
--     3. tear the live link down per surface, reusing the EXISTING
--        message/push conventions so the reported user sees a normal ending
--        (never "you were reported"):
--          chat     → mirror app_block (me page1 locked / page2 free;
--                     partner page1 locked+'leave', page2 free; push 'left').
--          waiting  → mirror app_cancel (me page1 locked; invitee page2
--                     locked+'cancel'; push 'cancelled-in').
--          pending  → mirror app_decline (me page2 free; inviter page1
--                     locked+'decline'; push 'declined').
--          watching → me page1 locked; remove me from the reported user's
--                     page2.profiles[]; no push (they never knew).
--          unknown  → report + block only (no state change).
--
-- BACKWARD COMPAT: purely additive. New table, new RPC, new /app/report
--   endpoint the deployed app never calls; reuses existing push codes
--   (left/cancelled-in/declined) so no client/global.ts change. NOT breaking.
-- ============================================================================

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  reporter_id  uuid not null,
  reported_id  uuid not null,
  context      text,                       -- chat|waiting|pending|watching|unknown
  reason       text,                       -- optional short code from client
  note         text,                       -- optional freeform from client
  handled      boolean not null default false,
  handled_at   timestamptz
);

create index if not exists reports_unhandled_idx
  on public.reports (created_at desc) where not handled;
create index if not exists reports_reported_idx
  on public.reports (reported_id);

alter table public.reports enable row level security;
-- No RLS policies on purpose (identical pattern to areas / groups /
-- restrictions): only the edge function and the web admin touch this, both
-- via the service-role key (which bypasses RLS).

create or replace function public.app_report(
  me_id       uuid,
  reported_id uuid,
  p_reason    text default null,
  p_note      text default null
)
returns jsonb
language plpgsql
as $function$
declare
  me_row      public.users;
  rep_row     public.users;
  p1_state    text;
  p1_target   uuid;
  p2_state    text;
  p2_target   uuid;
  v_context   text := 'unknown';
  notify      jsonb := '[]'::jsonb;
  result_user json;
begin
  select * into me_row from public.users where user_id = me_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if reported_id is null or reported_id = me_id then
    return jsonb_build_object('error', 'bad_target');
  end if;

  -- Lock both rows in a deterministic order (deadlock-safe), exactly like
  -- app_block. The reported row may not exist (deleted) — still record + block.
  perform 1 from public.users
   where user_id in (me_id, reported_id) order by user_id for update;

  select * into me_row  from public.users where user_id = me_id;
  select * into rep_row from public.users where user_id = reported_id;

  p1_state  := me_row.relations->'page1'->>'state';
  p1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  p2_state  := me_row.relations->'page2'->>'state';
  p2_target := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  if p1_target = reported_id and p1_state = 'chat' then
    v_context := 'chat';
  elsif p1_target = reported_id and p1_state = 'waiting' then
    v_context := 'waiting';
  elsif p1_target = reported_id and p1_state = 'watching' then
    v_context := 'watching';
  elsif p2_target = reported_id and p2_state = 'pending' then
    v_context := 'pending';
  end if;

  -- 1. Always record the report (moderation evidence, admin queue).
  insert into public.reports (reporter_id, reported_id, context, reason, note)
  values (me_id, reported_id, v_context, p_reason, p_note);

  -- 2. Always insert a PERMANENT block restriction (never rematch).
  perform public._add_restriction(me_id, reported_id, 'block');

  -- 3. Surface-specific teardown, reusing the existing endpoints' conventions.
  if v_context = 'chat' then
    update public.users set relations =
      jsonb_set(
        jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked')),
        '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    where user_id = me_id;

    update public.users set relations =
      jsonb_set(
        jsonb_set(relations, '{page1}',
          public._page1_locked(relations->'page1'->'profile', 'leave')),
        '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    where user_id = reported_id
      and relations->'page1'->>'state' = 'chat';

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'left'));

  elsif v_context = 'waiting' then
    -- I had an outgoing invite to the reported user → cancel-equivalent.
    update public.users set relations =
      jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked'))
    where user_id = me_id;

    update public.users set relations =
      jsonb_set(relations, '{page2}',
        public._page2_locked(relations->'page2'->'profile', 'cancel'))
    where user_id = reported_id
      and relations->'page2'->>'state' = 'pending'
      and (relations->'page2'->'profile'->>'user_id')::uuid = me_id;

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'cancelled-in'));

  elsif v_context = 'pending' then
    -- The reported user had invited me → decline-equivalent.
    update public.users set relations =
      jsonb_set(relations, '{page2}',
        jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb))
    where user_id = me_id;

    update public.users set relations =
      jsonb_set(relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'decline'))
    where user_id = reported_id
      and relations->'page1'->>'state' = 'waiting'
      and (relations->'page1'->'profile'->>'user_id')::uuid = me_id;

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'declined'));

  elsif v_context = 'watching' then
    -- I was only watching them (they never knew) → silently drop the link.
    update public.users set relations =
      jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked'))
    where user_id = me_id;

    perform public._remove_from_profiles(reported_id, me_id);
  end if;

  -- Defensive symmetric cleanup: if either side was a watcher of the other,
  -- drop those stale viewer entries so the block takes full effect now.
  perform public._remove_from_profiles(me_id, reported_id);
  perform public._remove_from_profiles(reported_id, me_id);

  select row_to_json(u) into result_user from public.users u where u.user_id = me_id;
  return jsonb_build_object('user', result_user, 'notify', notify);
end;
$function$;

revoke all on function public.app_report(uuid, uuid, text, text)
  from public, anon, authenticated;
