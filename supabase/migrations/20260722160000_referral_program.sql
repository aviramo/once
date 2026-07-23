-- Referral program (user decision 2026-07-22).
--
-- In-app purchase of credits is being switched off (every BUY_EXTRA_OPTIONS
-- row goes "coming soon"), and the ONLY way to earn beyond the daily pool
-- becomes: invite someone who actually joins. One credit per joined friend,
-- into credits.extra (the purchased pool -- uncapped, never expires), NOT
-- into the daily balance which _credits_cap() pins at 1 and the 20:00 grant
-- overwrites.
--
-- ATTRIBUTION IS FULLY AUTOMATIC -- the invitee never types a code (user
-- directive). The share link carries a per-user code into the Play Store
-- `referrer` parameter; the app reads it back on first launch via the Play
-- Install Referrer API and posts /app/referral. No onboarding UI changes.
--
-- QUALIFICATION is deliberately NOT "entered the code" and NOT "signed up".
-- It is the SAME predicate that already decides whether a user may be shown
-- to anyone else -- the matchable gate in others() (>= 1 image, see
-- 20260706040000_matchable_require_image_only.sql). If they are good enough
-- to appear in someone's pool, they are good enough to pay a referral for.
-- Extracted here as _referral_profile_complete so the two never drift.

-- ---------------------------------------------------------------------------
-- 1. Per-user referral code
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists referral_code text;

create unique index if not exists users_referral_code_key
  on public.users (referral_code);

-- 7 chars over a 31-symbol unambiguous alphabet (no 0/1/I/L/O) == ~27 billion
-- codes, so the collision retry loop below effectively never spins. Groups
-- use a 6-DIGIT code (_group_generate_invite_code) because a human types it
-- into a field; this one is only ever machine-read out of a URL, so it trades
-- typability for a namespace that survives scale.
create or replace function public._referral_generate_code()
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code  text;
  v_i     int;
  v_tries int := 0;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.users where referral_code = v_code) then
      return v_code;
    end if;
    v_tries := v_tries + 1;
    if v_tries > 100 then
      raise exception 'unable to generate unique referral_code after 100 attempts';
    end if;
  end loop;
end;
$$;

revoke execute on function public._referral_generate_code() from anon, authenticated;

create or replace function public._users_fill_referral_code()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
begin
  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := public._referral_generate_code();
  end if;
  return new;
end;
$$;

revoke execute on function public._users_fill_referral_code() from anon, authenticated;

drop trigger if exists users_fill_referral_code on public.users;
create trigger users_fill_referral_code
  before insert on public.users
  for each row
  execute function public._users_fill_referral_code();

-- Backfill everyone who predates the trigger. Row-at-a-time so each code goes
-- through the uniqueness check (a set-based update would race itself).
do $$
declare
  r record;
begin
  for r in select user_id from public.users where referral_code is null loop
    update public.users
    set referral_code = public._referral_generate_code()
    where user_id = r.user_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. referrals ledger
-- ---------------------------------------------------------------------------
--
-- unique(invitee_id) IS the anti-abuse core: an account belongs to exactly one
-- inviter, forever, decided the first time it is claimed and never revisable.
-- Everything else (device checks, daily cap) is a second line of defence.
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  inviter_id    uuid not null references public.users(user_id) on delete cascade,
  invitee_id    uuid not null unique references public.users(user_id) on delete cascade,
  code          text not null,
  -- How the code reached us: 'play_referrer' (Play Install Referrer API, the
  -- only automatic path today) or 'unknown'. Kept so we can measure the
  -- attribution loss rate before deciding whether an iOS fallback is worth it.
  source        text not null default 'unknown',
  created_at    timestamptz not null default now(),
  -- Invitee's profile passed the matchable gate.
  qualified_at  timestamptz,
  -- Inviter's wallet was actually credited. Null while qualified but capped.
  credited_at   timestamptz
);

create index if not exists referrals_inviter_idx on public.referrals (inviter_id);
create index if not exists referrals_pending_idx on public.referrals (created_at)
  where credited_at is null;

alter table public.referrals enable row level security;
-- No policies on purpose: reached only through SECURITY DEFINER RPCs / the
-- service_role edge function, never straight from the client.

-- ---------------------------------------------------------------------------
-- 3. Qualification predicate
-- ---------------------------------------------------------------------------

create or replace function public._referral_profile_complete(p_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  -- Mirrors the onboarding-complete gate inside others(): a displayable
  -- profile is one with at least one image. name / birth_date are set by the
  -- account insert, so they are belt-and-braces for hand-made rows.
  select exists (
    select 1 from public.users u
    where u.user_id = p_user_id
      and u.name is not null
      and u.birth_date is not null
      and jsonb_typeof(u.data->'images') = 'array'
      and jsonb_array_length(u.data->'images') >= 1
  )
$$;

revoke execute on function public._referral_profile_complete(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Crediting
-- ---------------------------------------------------------------------------

-- The daily cap has to ask "which grant day was this credited on?" about a
-- PAST timestamp, and _credits_grant_day() only ever answered for `now()`.
-- Generalize it and redefine the no-arg form on top, so the 20:00
-- Asia/Jerusalem boundary stays written down exactly once.
create or replace function public._credits_grant_day(at timestamptz)
  returns date
  language sql
  immutable parallel safe
as $$
  select (timezone('Asia/Jerusalem', at) - interval '20 hours')::date
$$;

create or replace function public._credits_grant_day()
  returns date
  language sql
  stable
as $$
  select public._credits_grant_day(now())
$$;

-- Credits per joined friend, and how many joins a single inviter may cash in
-- per credits grant day (20:00 Asia/Jerusalem, same boundary as the daily
-- pool). Over the cap the row is marked qualified but left uncredited, which
-- is what the caller reports so it lands in the log rather than failing
-- silently. Mirrored in mobile/src/lib/credits.ts (REFERRAL_REWARD).
create or replace function public._referral_reward() returns integer
  language sql immutable parallel safe as $$ select 1 $$;

create or replace function public._referral_daily_cap() returns integer
  language sql immutable parallel safe as $$ select 10 $$;

-- Credit one pending referral row. Shared by app_referral_qualify (the
-- invitee's own save-profile round trip) and app_referral_sweep (the cron
-- safety net) so the rule lives in exactly one place.
-- Returns: 'credited' | 'capped' | 'incomplete' | 'skipped'.
create or replace function public._referral_settle(p_referral_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_ref          record;
  v_rel          jsonb;
  v_today        int;
  v_inviter_test boolean;
  v_invitee_test boolean;
begin
  select * into v_ref from public.referrals where id = p_referral_id for update;
  if not found or v_ref.credited_at is not null then return 'skipped'; end if;

  if not public._referral_profile_complete(v_ref.invitee_id) then
    return 'incomplete';
  end if;

  -- Partition rule: skip only when the two sides sit in DIFFERENT partitions.
  -- The risk the test partition guards against is a test account minting
  -- currency for a real one (or the reverse). A referral BETWEEN two test
  -- accounts is sealed inside the sandbox, touches no real user's economy,
  -- and is the only way the feature can be end-to-end tested on real devices
  -- -- the first live test hit exactly this and was skipped.
  select coalesce(inv.is_test, false), coalesce(ine.is_test, false)
    into v_inviter_test, v_invitee_test
  from public.users inv, public.users ine
  where inv.user_id = v_ref.inviter_id and ine.user_id = v_ref.invitee_id;
  if v_inviter_test is distinct from v_invitee_test then
    update public.referrals set qualified_at = coalesce(qualified_at, now())
    where id = p_referral_id;
    return 'skipped';
  end if;

  update public.referrals set qualified_at = coalesce(qualified_at, now())
  where id = p_referral_id;

  select count(*) into v_today
  from public.referrals r
  where r.inviter_id = v_ref.inviter_id
    and r.credited_at is not null
    and public._credits_grant_day(r.credited_at) = public._credits_grant_day();
  if v_today >= public._referral_daily_cap() then
    return 'capped';
  end if;

  select relations into v_rel from public.users
  where user_id = v_ref.inviter_id for update;
  if not found then return 'skipped'; end if;

  v_rel := public._credits_ensure(v_rel);
  -- jsonb_set cannot create an intermediate object, so materialise
  -- relations.referral before writing into it.
  v_rel := jsonb_set(v_rel, '{referral}', coalesce(v_rel->'referral', '{}'::jsonb), true);

  -- Into `extra`, never `balance`: the daily pool is capped at
  -- _credits_cap() and rewritten by the 20:00 grant, so a reward parked there
  -- would silently evaporate. Clearing unpaid_at matches every other funding
  -- path (purchase / grant / refund) so a blocked user is released the moment
  -- money arrives.
  --
  -- relations.referral.joined is the denormalised counter behind the "N
  -- friends joined" line in the invite row. Kept on the user row on purpose:
  -- the client already receives relations wholesale, so the count costs no
  -- extra endpoint AND ticks up live over Realtime while the inviter watches.
  update public.users
  set relations = public._credits_clear_unpaid(jsonb_set(
    jsonb_set(
      v_rel,
      '{credits,extra}',
      to_jsonb(coalesce((v_rel->'credits'->>'extra')::int, 0) + public._referral_reward())),
    '{referral,joined}',
    to_jsonb(coalesce((v_rel->'referral'->>'joined')::int, 0) + 1),
    true))
  where user_id = v_ref.inviter_id;

  update public.referrals set credited_at = now() where id = p_referral_id;
  return 'credited';
end;
$$;

revoke execute on function public._referral_settle(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public RPCs
-- ---------------------------------------------------------------------------

-- Claim a referral code for the caller. Called once, from the invitee's first
-- launch, with the code the Play Install Referrer API handed back. Idempotent
-- and irreversible: once a row exists for this invitee nothing can rewrite it.
create or replace function public.app_referral_attach(me_id uuid, p_code text, p_source text default 'unknown')
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_code       text := upper(btrim(coalesce(p_code, '')));
  v_inviter    uuid;
  v_created    timestamptz;
  v_id         uuid;
  v_outcome    text;
  result_user  json;
begin
  if v_code = '' then return jsonb_build_object('error', 'no_code'); end if;

  select created_at into v_created from public.users where user_id = me_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  -- Guard ORDER matters. The already-claimed check has to come first so an
  -- idempotent client retry always succeeds, whatever the account's age, and
  -- the identity checks come before the age check so a caller learns the real
  -- reason rather than a misleading 'too_late'.
  if exists (select 1 from public.referrals where invitee_id = me_id) then
    select row_to_json(u) into result_user from public.users u where u.user_id = me_id;
    return jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'outcome', 'already');
  end if;

  select user_id into v_inviter from public.users where referral_code = v_code;
  if v_inviter is null then return jsonb_build_object('error', 'bad_code'); end if;
  if v_inviter = me_id then return jsonb_build_object('error', 'self_referral'); end if;

  -- An install referrer is only meaningful for a genuinely new account. A
  -- claim arriving long after signup is either a stale cached referrer or
  -- someone poking the endpoint; either way it is not an install we caused.
  if v_created < now() - interval '14 days' then
    return jsonb_build_object('error', 'too_late');
  end if;

  insert into public.referrals (inviter_id, invitee_id, code, source)
  values (v_inviter, me_id, v_code, coalesce(nullif(btrim(p_source), ''), 'unknown'))
  returning id into v_id;

  -- Try to settle immediately: an invitee whose profile is already complete
  -- (re-install, or the referrer arriving late) should not wait for the next
  -- save-profile or cron tick.
  v_outcome := public._referral_settle(v_id);

  select row_to_json(u) into result_user from public.users u where u.user_id = me_id;
  return jsonb_build_object(
    'user', result_user,
    'notify', case when v_outcome = 'credited'
      then jsonb_build_array(jsonb_build_object('user_id', v_inviter, 'code', 'referral', 'actor_id', me_id))
      else '[]'::jsonb end,
    'outcome', v_outcome);
end;
$$;

revoke execute on function public.app_referral_attach(uuid, text, text) from anon, authenticated;

-- Settle the caller's own pending referral, if any. Fired right after the
-- invitee saves a profile -- the round trip in which they typically become
-- matchable. No-op for the overwhelming majority of calls.
create or replace function public.app_referral_qualify(me_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_id      uuid;
  v_inviter uuid;
  v_outcome text;
begin
  select id, inviter_id into v_id, v_inviter
  from public.referrals
  where invitee_id = me_id and credited_at is null;
  if v_id is null then return jsonb_build_object('outcome', 'none', 'notify', '[]'::jsonb); end if;

  v_outcome := public._referral_settle(v_id);
  return jsonb_build_object(
    'outcome', v_outcome,
    'notify', case when v_outcome = 'credited'
      then jsonb_build_array(jsonb_build_object('user_id', v_inviter, 'code', 'referral', 'actor_id', me_id))
      else '[]'::jsonb end);
end;
$$;

revoke execute on function public.app_referral_qualify(uuid) from anon, authenticated;

-- Cron safety net. Catches every path app_referral_qualify cannot see: a
-- profile completed by an old mobile build, an invitee who uploaded their
-- photo in a round trip that errored, and rows that were capped earlier in
-- the day and are now under the cap again.
create or replace function public.app_referral_sweep()
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  r          record;
  v_outcome  text;
  v_notify   jsonb := '[]'::jsonb;
  v_credited int := 0;
begin
  for r in
    select id, inviter_id, invitee_id
    from public.referrals
    where credited_at is null
      and created_at > now() - interval '30 days'
    order by created_at
    limit 200
  loop
    v_outcome := public._referral_settle(r.id);
    if v_outcome = 'credited' then
      v_credited := v_credited + 1;
      v_notify := v_notify || jsonb_build_object(
        'user_id', r.inviter_id, 'code', 'referral', 'actor_id', r.invitee_id);
    end if;
  end loop;

  return jsonb_build_object('processed', v_credited, 'notify', v_notify);
end;
$$;

revoke execute on function public.app_referral_sweep() from anon, authenticated;

-- No app_referral_stats RPC on purpose: the only number the client shows is
-- relations.referral.joined, which _referral_settle maintains on the user row
-- and every existing response already carries.
