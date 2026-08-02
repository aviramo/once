-- THE REVIEW DOOR IS GONE, AND SO IS EVERYTHING THAT SERVED IT.
--
-- The `review-login` edge function was the app's ONE pre-auth path: a fixed
-- address and a static code in exchange for an OTP into a pre-approved account,
-- bypassing both the magic link and the circle membership everything else is
-- gated on. Earlier today its code was moved out of the repo and rate-limited
-- (20260803130000); then the question was asked whether anyone was using it, and
-- the answer was nobody: signed in exactly once, on the day it was built, and no
-- store listing ever carried the demo credentials for a reviewer to type. A door
-- that serves nobody is only a way in, so it is deleted — function, client UI,
-- strings, and these three RPCs, which had no other caller.
--
-- app_review_seed is dropped WITH it: it exists to make one account a fully
-- onboarded member of the enabled test circle, which is exactly the privilege
-- escalation the door was granting. The ACCOUNT is left alone (is_test, three
-- photos, harmless), so bringing this back for a future submission is a fresh
-- function and a fresh secret, never a code that once lived in git.
--
-- The rate limiter outlived its subject by about an hour. It was right while
-- there was a door to guard; there is no second pre-auth endpoint for it to
-- protect, and a table nothing writes to is one more thing to explain later.
drop function if exists public.app_review_login_allowed(text);
drop function if exists public.app_review_login_failed(text);
drop table if exists public.review_login_attempts;
drop function if exists public.app_review_seed(uuid);
