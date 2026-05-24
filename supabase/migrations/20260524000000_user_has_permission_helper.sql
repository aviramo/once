-- ============================================================================
-- public.user_has_permission(uid, key) — true iff the user belongs to at
-- least one group that has the named permission. Used by the web admin's
-- owner gate (only owners can grant/revoke permissions on groups).
--
-- Permission is membership-driven: a user "has X" iff any of their groups
-- carries X in group_permissions. There is no per-user permission table.
--
-- security definer + search_path='' so the planner can inline it; EXECUTE
-- revoked from anon/authenticated — service-role only (web admin via the
-- admin client).
-- ============================================================================

create or replace function public.user_has_permission(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.user_groups ug
    join public.group_permissions gp on gp.group_id = ug.group_id
    where ug.user_id = p_user_id
      and gp.permission_key = p_key
  );
$$;

revoke execute on function public.user_has_permission(uuid, text) from anon, authenticated;

-- Bootstrap: the single existing admin (the only one who can sign into the
-- web admin today) is also the owner, so the new owner-gated UI actually
-- works on first use. Idempotent on the (user_id, group_id) PK.
insert into public.user_groups (user_id, group_id)
select '3109a0a6-8f1b-41d5-a455-2b3cffa3d030'::uuid, g.id
from public.groups g
where g.name = 'בעלים'
on conflict (user_id, group_id) do nothing;
