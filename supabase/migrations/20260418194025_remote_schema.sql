alter table "public"."chat" drop column "event";

alter table "public"."chat" add column "is_event" boolean;


