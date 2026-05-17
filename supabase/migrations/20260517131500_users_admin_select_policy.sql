-- Additive permissive SELECT policy: an authenticated session whose JWT
-- app_metadata.role = 'admin' can read every users row. Required for the
-- admin panel's browser Realtime subscription (postgres_changes enforces
-- RLS per subscriber; the existing 'owners' policy still limits non-admins
-- to their own row, unchanged). app_metadata is service-role set and
-- signed into the JWT, so a client cannot forge it. Non-breaking.
create policy "admins read all"
on public.users
for select
to authenticated
using ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );
