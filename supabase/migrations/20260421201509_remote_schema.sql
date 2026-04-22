drop policy "block" on "public"."log";

drop policy "block" on "public"."actions";

revoke delete on table "public"."log" from "service_role";

revoke insert on table "public"."log" from "service_role";

revoke references on table "public"."log" from "service_role";

revoke select on table "public"."log" from "service_role";

revoke trigger on table "public"."log" from "service_role";

revoke truncate on table "public"."log" from "service_role";

revoke update on table "public"."log" from "service_role";

alter table "public"."actions" drop constraint "restrictions_other_id_fkey";

alter table "public"."actions" drop constraint "restrictions_user_id_fkey";

alter table "public"."log" drop constraint "log_other_id_fkey";

alter table "public"."log" drop constraint "log_user_id_fkey";

alter table "public"."actions" drop constraint "actions_pkey";

alter table "public"."log" drop constraint "log_pkey";

drop index if exists "public"."actions_pkey";

drop index if exists "public"."idx_actions_lookup";

drop index if exists "public"."log_pkey";

drop table "public"."log";


  create table "public"."states" (
    "user_id" uuid not null default gen_random_uuid(),
    "other_id" uuid default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "state" text not null,
    "id" uuid not null default gen_random_uuid()
      );


alter table "public"."states" enable row level security;

alter table "public"."actions" drop column "other_id";

alter table "public"."actions" add column "id" uuid not null default gen_random_uuid();

alter table "public"."actions" add column "log" jsonb;

alter table "public"."actions" add column "run_ms" integer;

alter table "public"."actions" add column "status" smallint;

alter table "public"."actions" add column "user" jsonb;

alter table "public"."actions" alter column "user_id" drop default;

alter table "public"."actions" alter column "user_id" drop not null;

CREATE UNIQUE INDEX states_pkey ON public.states USING btree (id);

CREATE INDEX idx_actions_lookup ON public.states USING btree (user_id, other_id, state, created_at);

CREATE UNIQUE INDEX log_pkey ON public.actions USING btree (id);

alter table "public"."actions" add constraint "log_pkey" PRIMARY KEY using index "log_pkey";

alter table "public"."states" add constraint "states_pkey" PRIMARY KEY using index "states_pkey";

alter table "public"."actions" add constraint "log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."actions" validate constraint "log_user_id_fkey";

alter table "public"."states" add constraint "restrictions_other_id_fkey" FOREIGN KEY (other_id) REFERENCES auth.users(id) not valid;

alter table "public"."states" validate constraint "restrictions_other_id_fkey";

alter table "public"."states" add constraint "restrictions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."states" validate constraint "restrictions_user_id_fkey";

grant delete on table "public"."states" to "service_role";

grant insert on table "public"."states" to "service_role";

grant references on table "public"."states" to "service_role";

grant select on table "public"."states" to "service_role";

grant trigger on table "public"."states" to "service_role";

grant truncate on table "public"."states" to "service_role";

grant update on table "public"."states" to "service_role";


  create policy "block"
  on "public"."states"
  as permissive
  for all
  to public
using (false)
with check (false);



  create policy "block"
  on "public"."actions"
  as permissive
  for all
  to public
using (false);



