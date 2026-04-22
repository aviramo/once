revoke delete on table "public"."states" from "anon";

revoke insert on table "public"."states" from "anon";

revoke references on table "public"."states" from "anon";

revoke select on table "public"."states" from "anon";

revoke trigger on table "public"."states" from "anon";

revoke truncate on table "public"."states" from "anon";

revoke update on table "public"."states" from "anon";

revoke delete on table "public"."states" from "authenticated";

revoke insert on table "public"."states" from "authenticated";

revoke references on table "public"."states" from "authenticated";

revoke select on table "public"."states" from "authenticated";

revoke trigger on table "public"."states" from "authenticated";

revoke truncate on table "public"."states" from "authenticated";

revoke update on table "public"."states" from "authenticated";

alter table "public"."states" add column "action_id" uuid default gen_random_uuid();

alter table "public"."states" alter column "other_id" drop default;

alter table "public"."states" alter column "user_id" drop default;


