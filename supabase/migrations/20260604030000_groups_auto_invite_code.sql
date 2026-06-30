-- groups.invite_code is NOT NULL with no default and nothing populated it on a
-- plain insert, so the admin "add group" form (createGroup -> insert {name})
-- failed the NOT NULL constraint. Fill it via a BEFORE INSERT trigger using the
-- existing unique-code generator, so every insert path gets a code (and any
-- explicit code passed in still wins).
create or replace function public._group_fill_invite_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invite_code is null or btrim(new.invite_code) = '' then
    new.invite_code := public._group_generate_invite_code();
  end if;
  return new;
end;
$$;

revoke execute on function public._group_fill_invite_code() from anon, authenticated;

drop trigger if exists groups_fill_invite_code on public.groups;
create trigger groups_fill_invite_code
  before insert on public.groups
  for each row
  execute function public._group_fill_invite_code();
