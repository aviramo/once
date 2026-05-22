-- New-users default group: create the "חדשים" group and auto-assign every
-- newly created user to it. With every new user landing in an enabled group,
-- public.in_enabled_group() is always true for them, so user_availability()
-- returns 'available' and the join-request flow is never needed for new users.

-- 1. The group (idempotent on the unique name).
insert into public.groups (name, enabled)
values ('חדשים', true)
on conflict (name) do nothing;

-- 2. Trigger function: add each freshly inserted user to the "חדשים" group.
--    Looks the group up by name so no generated id is hardcoded; SECURITY
--    DEFINER + search_path='' so it runs regardless of the inserting role
--    (user_groups has no RLS policies -- service-role/owner only).
create or replace function public.assign_new_user_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select id into v_group from public.groups where name = 'חדשים' limit 1;
  if v_group is not null then
    insert into public.user_groups (user_id, group_id)
    values (new.user_id, v_group)
    on conflict (user_id, group_id) do nothing;
  end if;
  return new;
end;
$$;

-- 3. Wire it to users INSERT.
drop trigger if exists users_assign_new_user_group on public.users;
create trigger users_assign_new_user_group
after insert on public.users
for each row execute function public.assign_new_user_group();
