drop policy "authenticated" on "public"."users";


  create policy "block"
  on "public"."users"
  as permissive
  for all
  to public
using (false)
with check (false);



  create policy "owners"
  on "public"."users"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



