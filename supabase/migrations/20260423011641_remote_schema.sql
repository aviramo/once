alter table "public"."users" add column "name" text generated always as ((data ->> 'name'::text)) stored;


