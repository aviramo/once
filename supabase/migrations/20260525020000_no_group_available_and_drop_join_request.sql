-- 2026-05-25 — user decisions:
--   1) New signups must NOT auto-join the "חדשים" group. Drop the trigger.
--   2) A user with NO groups at all is AVAILABLE (the membership gate fires
--      only when the user is in groups AND every one of them is disabled).
--   3) The "join request" / "pending approval" experience is retired
--      entirely — no message to the user, ever. Strip any existing
--      relations.join_request key and any availability.{join_requested,
--      reason:'group'} sub-fields so old clients can't render the pending
--      UI from stale state. The /app/join_request endpoint is removed from
--      the edge dispatcher in the same release; the RPC is dropped here.

DROP TRIGGER IF EXISTS users_assign_new_user_group ON public.users;
DROP FUNCTION IF EXISTS public.assign_new_user_group();

CREATE OR REPLACE FUNCTION public.user_availability(uid uuid, loc geography)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'push')
    when loc is null
      then jsonb_build_object('state', 'available')
    when public.in_enabled_group(uid)
      then jsonb_build_object('state', 'available')
    when not exists (
      select 1 from public.user_groups ug where ug.user_id = uid
    )
      -- No groups at all => unrestricted. The gate fires ONLY when the user
      -- is in groups and every one of them is disabled.
      then jsonb_build_object('state', 'available')
    else
      jsonb_build_object('state', 'unavailable', 'reason', 'group')
  end
$function$;

-- others(): mirror the same "no-group OR enabled-group" rule. Replace the
-- prior in_enabled_group-only clause without touching anything else.
DO $$
DECLARE
  body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO body
  FROM pg_proc p
  WHERE p.proname = 'others' AND p.pronamespace = 'public'::regnamespace
  LIMIT 1;
  body := replace(
    body,
    'AND (NOT only_available OR public.in_enabled_group(other.user_id))',
    'AND (NOT only_available OR public.in_enabled_group(other.user_id) OR NOT EXISTS (SELECT 1 FROM public.user_groups ug WHERE ug.user_id = other.user_id))'
  );
  EXECUTE body;
END $$;

-- Strip every existing join_request key, then re-apply user_availability so
-- the stored availability blob is current under the new rules.
UPDATE public.users
   SET relations = relations - 'join_request'
 WHERE relations ? 'join_request';

UPDATE public.users u
   SET relations = jsonb_set(
         u.relations,
         '{availability}',
         public.user_availability(u.user_id, u.location)
       )
 WHERE user_id IS NOT NULL;

-- Retire the request-to-join RPCs entirely. The user explicitly asked to
-- remove every server trace, not just neuter them; the /app/join_request
-- endpoint is removed from the edge dispatcher in the same release.
DROP FUNCTION IF EXISTS public.app_admin_clear_join_request(uuid);
DROP FUNCTION IF EXISTS public.join_requested(uuid);
DROP FUNCTION IF EXISTS public.app_join_request(uuid);
