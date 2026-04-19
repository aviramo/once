revoke delete on table "public"."actions" from "anon";

revoke insert on table "public"."actions" from "anon";

revoke references on table "public"."actions" from "anon";

revoke select on table "public"."actions" from "anon";

revoke trigger on table "public"."actions" from "anon";

revoke truncate on table "public"."actions" from "anon";

revoke update on table "public"."actions" from "anon";

revoke delete on table "public"."actions" from "authenticated";

revoke insert on table "public"."actions" from "authenticated";

revoke references on table "public"."actions" from "authenticated";

revoke select on table "public"."actions" from "authenticated";

revoke trigger on table "public"."actions" from "authenticated";

revoke truncate on table "public"."actions" from "authenticated";

revoke update on table "public"."actions" from "authenticated";

revoke delete on table "public"."chat" from "anon";

revoke insert on table "public"."chat" from "anon";

revoke references on table "public"."chat" from "anon";

revoke select on table "public"."chat" from "anon";

revoke trigger on table "public"."chat" from "anon";

revoke truncate on table "public"."chat" from "anon";

revoke update on table "public"."chat" from "anon";

revoke delete on table "public"."chat" from "authenticated";

revoke insert on table "public"."chat" from "authenticated";

revoke references on table "public"."chat" from "authenticated";

revoke trigger on table "public"."chat" from "authenticated";

revoke truncate on table "public"."chat" from "authenticated";

revoke update on table "public"."chat" from "authenticated";

revoke delete on table "public"."log" from "anon";

revoke insert on table "public"."log" from "anon";

revoke references on table "public"."log" from "anon";

revoke select on table "public"."log" from "anon";

revoke trigger on table "public"."log" from "anon";

revoke truncate on table "public"."log" from "anon";

revoke update on table "public"."log" from "anon";

revoke delete on table "public"."log" from "authenticated";

revoke insert on table "public"."log" from "authenticated";

revoke references on table "public"."log" from "authenticated";

revoke select on table "public"."log" from "authenticated";

revoke trigger on table "public"."log" from "authenticated";

revoke truncate on table "public"."log" from "authenticated";

revoke update on table "public"."log" from "authenticated";

revoke delete on table "public"."users" from "anon";

revoke insert on table "public"."users" from "anon";

revoke references on table "public"."users" from "anon";

revoke select on table "public"."users" from "anon";

revoke trigger on table "public"."users" from "anon";

revoke truncate on table "public"."users" from "anon";

revoke update on table "public"."users" from "anon";

revoke delete on table "public"."users" from "authenticated";

revoke insert on table "public"."users" from "authenticated";

revoke references on table "public"."users" from "authenticated";

revoke trigger on table "public"."users" from "authenticated";

revoke truncate on table "public"."users" from "authenticated";

revoke update on table "public"."users" from "authenticated";

CREATE INDEX idx_actions_lookup ON public.actions USING btree (user_id, other_id, key, created_at);

CREATE INDEX idx_chat_participants ON public.chat USING btree (user_id, other_id);

CREATE INDEX idx_users_location ON public.users USING gist (location);

CREATE INDEX idx_users_other_id ON public.users USING btree (other_id);

CREATE INDEX idx_users_state ON public.users USING btree (state);

alter table "public"."users" add constraint "age_range_valid" CHECK (((age_from IS NULL) OR (age_to IS NULL) OR ((age_from >= 18) AND (age_to >= age_from)))) not valid;

alter table "public"."users" validate constraint "age_range_valid";

alter table "public"."users" add constraint "birth_date_valid" CHECK (((birth_date IS NULL) OR ((birth_date <= (CURRENT_DATE - '18 years'::interval)) AND (birth_date >= (CURRENT_DATE - '120 years'::interval))))) not valid;

alter table "public"."users" validate constraint "birth_date_valid";

alter table "public"."users" add constraint "location_valid" CHECK (((location IS NULL) OR (((extensions.st_x((location)::extensions.geometry) >= ('-180'::integer)::double precision) AND (extensions.st_x((location)::extensions.geometry) <= (180)::double precision)) AND ((extensions.st_y((location)::extensions.geometry) >= ('-90'::integer)::double precision) AND (extensions.st_y((location)::extensions.geometry) <= (90)::double precision))))) not valid;

alter table "public"."users" validate constraint "location_valid";

alter table "public"."users" add constraint "range_valid" CHECK (((range IS NULL) OR (range >= 0))) not valid;

alter table "public"."users" validate constraint "range_valid";

alter table "public"."users" add constraint "state_valid" CHECK (((state IS NULL) OR (state = ANY (ARRAY['HIDDEN'::text, 'VISIBLE'::text, 'WATCHING'::text, 'WAITING'::text, 'REPLYING'::text, 'CHAT'::text, 'CANCELLED'::text, 'MISSED'::text, 'REFUSED'::text, 'LEFT'::text, 'REMOVED'::text, 'LOGGED_OUT'::text, 'INVITED'::text, 'HID'::text, 'DELETED'::text])))) not valid;

alter table "public"."users" validate constraint "state_valid";


