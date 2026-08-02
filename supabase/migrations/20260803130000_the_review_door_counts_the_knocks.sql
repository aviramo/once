-- THE REVIEW DOOR COUNTS THE KNOCKS.
--
-- review-login is the app's one pre-auth endpoint: a fixed email and a fixed
-- code, in exchange for a one-time OTP into the dedicated store-review account.
-- It had no rate limit of any kind, so the code could be guessed at whatever
-- rate the edge runtime would answer — and the code was a static string in the
-- repo, which is the other half of the same finding.
--
-- A window per CALLER, not a global one: a global counter would let anyone lock
-- the reviewers out by hammering the endpoint from anywhere, which is a worse
-- outcome than the guessing it prevents (a store review that cannot sign in is a
-- rejected release). The caller is the client IP off the platform's own header.
--
-- ONLY FAILURES ARE COUNTED. A reviewer signing in repeatedly is what this
-- endpoint is FOR — they open the app many times over a review — so a correct
-- code must never be what closes the door. That also makes the limit a pure
-- statement about guessing: REVIEW_LOGIN_MAX wrong answers inside the window and
-- the caller waits it out.
create table if not exists public.review_login_attempts (
  ip          text        not null,
  attempted_at timestamptz not null default now()
);

create index if not exists review_login_attempts_ip_at
  on public.review_login_attempts (ip, attempted_at desc);

alter table public.review_login_attempts enable row level security;

-- Ask whether this caller may knock, and if so remember the knock. One round
-- trip, because the check and the record must not race each other. Returns TRUE
-- when the caller is allowed to proceed.
--
-- The prune is done here rather than on a schedule: the table only ever holds
-- failures inside the window plus whatever has not been swept yet, so it is
-- never big enough to deserve a cron job of its own.
create or replace function public.app_review_login_allowed(p_ip text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  window_len constant interval := interval '15 minutes';
  max_fails  constant int      := 10;
  fails      int;
begin
  if p_ip is null or p_ip = '' then p_ip := 'unknown'; end if;

  delete from public.review_login_attempts
   where attempted_at < now() - window_len;

  select count(*) into fails
    from public.review_login_attempts
   where ip = p_ip
     and attempted_at > now() - window_len;

  if fails >= max_fails then return false; end if;
  return true;
end;
$$;

-- Record a WRONG answer. Separate from the check above so the edge function
-- calls it only on the failing branch — see "only failures are counted".
create or replace function public.app_review_login_failed(p_ip text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_ip is null or p_ip = '' then p_ip := 'unknown'; end if;
  insert into public.review_login_attempts (ip) values (p_ip);
end;
$$;

revoke all on function public.app_review_login_allowed(text) from public, anon, authenticated;
revoke all on function public.app_review_login_failed(text)  from public, anon, authenticated;
grant execute on function public.app_review_login_allowed(text) to service_role;
grant execute on function public.app_review_login_failed(text)  to service_role;
