alter table "public"."states" alter column "action_id" drop default;

alter table "public"."states" alter column "action_id" set not null;


