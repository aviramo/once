-- 2026-07-26 — Friend-link credits: a new mutual friendship pays BOTH sides.
--
-- User directive 2026-07-26: "only friend connections credit the two friends
-- with one extra credit each; joining a group that is not the friends relation
-- credits nobody."
--
-- The group half already holds: app_redeem_invite / app_respond_join touch no
-- wallet, so a group join has never minted a credit and still doesn't. This
-- migration implements the other half: every genuinely NEW friend_links row
-- grants +1 into credits.extra to EACH of the two users, once per (user, peer)
-- forever (NO per-day cap — user directive 2026-07-26), and gated by the SAME
-- test/real partition rule the referral program uses (a test account must not
-- mint currency for a real one, or vice versa).
--
-- Implemented as an AFTER INSERT trigger on friend_links so EVERY path that can
-- create a friendship is credited in ONE place — app_friend_request's
-- auto-accept branch, app_friend_respond, app_friend_link_by_code, and anything
-- added later — with no risk of a path forgetting to pay. This is deliberately
-- separate from the install-referral ledger (_referral_settle), which credits
-- the inviter and creates NO friend_links row, so the two never double-credit.
--
-- ADDITIVE: new table + trigger + helpers; no signature change to any RPC the
-- live app calls, and the wallet shape is unchanged (still credits.extra). The
-- credited user sees the bump over Realtime like every other funding path. No
-- BACKWARD_COMPAT.md entry required.

-- Per-friendship reward. Named so the number lives once; mirrors
-- _referral_reward so the two credit economies read the same at a glance. There
-- is deliberately NO per-day cap (user directive 2026-07-26) — the once-per-pair
-- ledger below is the only limiter.
create or replace function public._friend_reward() returns integer
  language sql immutable parallel safe as $$ select 1 $$;

-- Idempotency ledger. One row per (user, peer) DIRECTION: the PK stops a
-- re-credit if a pair unfriends and re-links (no farm via
-- connect/disconnect/connect). A single friendship inserts two rows (a→b and
-- b→a) because each side is credited independently.
create table if not exists public.friend_credits (
  user_id    uuid not null references public.users(user_id) on delete cascade,
  peer_id    uuid not null references public.users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, peer_id)
);
alter table public.friend_credits enable row level security;  -- service-role only

-- Credit one side (uid) for befriending peer. The caller has already confirmed
-- the two sit in the same test/real partition. Silently skips when uid was
-- already credited for this peer. No per-day cap.
create or replace function public._friend_credit_side(uid uuid, peer uuid)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_rel   jsonb;
  v_rows  int;
begin
  -- Once per peer, forever. ON CONFLICT makes concurrent/duplicate fires safe.
  insert into public.friend_credits(user_id, peer_id) values (uid, peer)
    on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;  -- already credited for this peer

  select relations into v_rel from public.users where user_id = uid for update;
  if not found then
    delete from public.friend_credits where user_id = uid and peer_id = peer;
    return;
  end if;

  -- Into `extra`, never `balance`: the daily pool is capped by _credits_cap()
  -- and rewritten by the 20:00 grant, so a reward parked there would evaporate.
  -- Clearing unpaid_at matches every other funding path so a blocked user is
  -- released the moment credit arrives. relations.referral.joined is the
  -- denormalised "friends connected through you" counter the invite row shows;
  -- a friend connection ticks it up for BOTH sides (each gained a friend).
  v_rel := public._credits_ensure(v_rel);
  v_rel := jsonb_set(v_rel, '{referral}', coalesce(v_rel->'referral', '{}'::jsonb), true);
  update public.users
  set relations = public._credits_clear_unpaid(jsonb_set(
    jsonb_set(
      v_rel,
      '{credits,extra}',
      to_jsonb(coalesce((v_rel->'credits'->>'extra')::int, 0) + public._friend_reward())),
    '{referral,joined}',
    to_jsonb(coalesce((v_rel->'referral'->>'joined')::int, 0) + 1),
    true))
  where user_id = uid;
end;
$$;

revoke execute on function public._friend_credit_side(uuid, uuid) from anon, authenticated;

-- The trigger: partition-check once, then credit each side. friend_links
-- enforces a < b, so crediting a before b locks the two user rows in ascending
-- user_id order — concurrent friendships sharing a user can never deadlock.
create or replace function public._trg_friend_credit()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_a_test boolean;
  v_b_test boolean;
begin
  select coalesce(ua.is_test, false), coalesce(ub.is_test, false)
    into v_a_test, v_b_test
  from public.users ua, public.users ub
  where ua.user_id = new.a and ub.user_id = new.b;

  -- Different partitions → nobody is paid (mirrors _referral_settle).
  if v_a_test is distinct from v_b_test then
    return null;
  end if;

  perform public._friend_credit_side(new.a, new.b);
  perform public._friend_credit_side(new.b, new.a);
  return null;
end;
$$;

drop trigger if exists friend_links_credit on public.friend_links;
create trigger friend_links_credit
  after insert on public.friend_links
  for each row execute function public._trg_friend_credit();
