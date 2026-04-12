drop trigger if exists "users_after" on "public"."users";

drop trigger if exists "users_before" on "public"."users";

drop function if exists "public"."match"(me public.users);

drop function if exists "public"."users"();

drop function if exists "public"."watcher"("user" public.users, location extensions.geography);

alter table "public"."users" drop column "updated_at";


