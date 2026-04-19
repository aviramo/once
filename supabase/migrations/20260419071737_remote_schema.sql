
  create policy "block"
  on "public"."actions"
  as permissive
  for all
  to public
using (false)
with check (false);



