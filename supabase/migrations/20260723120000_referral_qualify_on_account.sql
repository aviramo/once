-- Referral qualification loosened (user decision 2026-07-23).
--
-- Until now _referral_profile_complete deliberately mirrored the matchable
-- gate in others() (>= 1 image), so an inviter was paid only once the invitee
-- was good enough to be shown to someone. The two are now DECOUPLED on purpose:
-- qualification becomes simply "the invitee has a users row" -- i.e. they
-- pressed Create account. No images, no bio, and no per-field checks.
--
-- The public.users row is written only by user.insert() behind /app/account
-- (supabase/functions/user.ts), so its mere existence IS the account-created
-- signal. Testing for the row rather than for name/birth_date/is_male keeps the
-- predicate indifferent to which columns onboarding happens to populate.
--
-- This only ever LETS MORE referrals settle (a strict superset of the old
-- predicate), so it is non-breaking: every already-credited row stays credited,
-- and the client still reads only relations.referral.joined.

create or replace function public._referral_profile_complete(p_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  -- Account-created gate: the invitee's users row exists, nothing more.
  -- Intentionally decoupled from others()'s matchable gate as of 2026-07-23.
  select exists (
    select 1 from public.users u where u.user_id = p_user_id
  )
$$;

revoke execute on function public._referral_profile_complete(uuid) from anon, authenticated;
