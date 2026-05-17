-- Backfill the new roles model from the legacy free-form users.data.role
-- string (the only values in the wild are 'TEST' and 'ADMIN'). Comma-split +
-- trim so a hypothetical "ADMIN,TEST" also lands as two roles; single tokens
-- are unaffected. Created roles are ENABLED (default) so the backfill never
-- silently gates the 42 existing tagged users — the admin can disable from
-- the UI. data.role itself is left intact (legacy, read by nothing).
-- Idempotent: ON CONFLICT DO NOTHING on both inserts, so re-running is safe.

with clean as (
  select u.user_id, btrim(t) as name
  from public.users u
  cross join lateral unnest(string_to_array(u.data->>'role', ',')) as t
  where coalesce(btrim(u.data->>'role'), '') <> ''
    and btrim(t) <> ''
)
insert into public.roles(name)
select distinct name from clean
on conflict (name) do nothing;

with clean as (
  select u.user_id, btrim(t) as name
  from public.users u
  cross join lateral unnest(string_to_array(u.data->>'role', ',')) as t
  where coalesce(btrim(u.data->>'role'), '') <> ''
    and btrim(t) <> ''
)
insert into public.user_roles(user_id, role_id)
select c.user_id, r.id
from clean c
join public.roles r on r.name = c.name
on conflict (user_id, role_id) do nothing;
