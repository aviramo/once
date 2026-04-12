create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "pgjwt" with schema "extensions";

create extension if not exists "postgis" with schema "extensions";


  create table "public"."actions" (
    "user_id" uuid not null default gen_random_uuid(),
    "other_id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "key" text
      );


alter table "public"."actions" enable row level security;


  create table "public"."chat" (
    "user_id" uuid not null,
    "other_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "text" text not null,
    "client_id" text
      );


alter table "public"."chat" enable row level security;


  create table "public"."log" (
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid,
    "id" uuid not null default gen_random_uuid(),
    "event" text,
    "location" extensions.geography,
    "message" text,
    "other_id" uuid,
    "state" text,
    "status" smallint,
    "run_ms" integer,
    "data" jsonb,
    "other_location" extensions.geography,
    "action" text
      );


alter table "public"."log" enable row level security;


  create table "public"."users" (
    "created_at" timestamp with time zone default now(),
    "user_id" uuid not null,
    "other_id" uuid,
    "last_seen" timestamp with time zone default now(),
    "location" extensions.geography,
    "is_visible" boolean,
    "is_male" boolean,
    "is_for_male" boolean,
    "is_for_female" boolean,
    "birth_date" date,
    "age_from" smallint,
    "age_to" smallint,
    "name" text,
    "image" text,
    "message" text,
    "state" text,
    "subscription" jsonb,
    "range" integer,
    "match" jsonb,
    "role" text,
    "lang" text,
    "is_for_kids" boolean,
    "os" text,
    "coords" jsonb,
    "blurred" text,
    "watchers" jsonb,
    "watchers_count" smallint,
    "updated_at" timestamp with time zone
      );


alter table "public"."users" enable row level security;

CREATE UNIQUE INDEX actions_pkey ON public.actions USING btree (user_id, other_id, created_at);

CREATE UNIQUE INDEX chat_pkey ON public.chat USING btree (user_id, other_id, created_at);

CREATE UNIQUE INDEX log_pkey ON public.log USING btree (id);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (user_id);

alter table "public"."actions" add constraint "actions_pkey" PRIMARY KEY using index "actions_pkey";

alter table "public"."chat" add constraint "chat_pkey" PRIMARY KEY using index "chat_pkey";

alter table "public"."log" add constraint "log_pkey" PRIMARY KEY using index "log_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."actions" add constraint "restrictions_other_id_fkey" FOREIGN KEY (other_id) REFERENCES auth.users(id) not valid;

alter table "public"."actions" validate constraint "restrictions_other_id_fkey";

alter table "public"."actions" add constraint "restrictions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."actions" validate constraint "restrictions_user_id_fkey";

alter table "public"."chat" add constraint "chat_other_id_fkey" FOREIGN KEY (other_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."chat" validate constraint "chat_other_id_fkey";

alter table "public"."chat" add constraint "chat_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."chat" validate constraint "chat_user_id_fkey";

alter table "public"."log" add constraint "log_other_id_fkey" FOREIGN KEY (other_id) REFERENCES auth.users(id) not valid;

alter table "public"."log" validate constraint "log_other_id_fkey";

alter table "public"."log" add constraint "log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."log" validate constraint "log_user_id_fkey";

alter table "public"."users" add constraint "users_other_id_fkey" FOREIGN KEY (other_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_other_id_fkey";

alter table "public"."users" add constraint "users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_complete_schema()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    result jsonb;
BEGIN
    -- Get all enums
    WITH enum_types AS (
        SELECT 
            t.typname as enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
    )
    SELECT jsonb_build_object(
        'enums',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', enum_name,
                    'values', to_jsonb(enum_values)
                )
            ),
            '[]'::jsonb
        )
    )
    FROM enum_types
    INTO result;

    -- Get all tables with their details
    WITH RECURSIVE 
    columns_info AS (
        SELECT 
            c.oid as table_oid,
            c.relname as table_name,
            a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as column_type,
            a.attnotnull as notnull,
            pg_get_expr(d.adbin, d.adrelid) as column_default,
            CASE 
                WHEN a.attidentity != '' THEN true
                WHEN pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%' THEN true
                ELSE false
            END as is_identity,
            EXISTS (
                SELECT 1 FROM pg_constraint con 
                WHERE con.conrelid = c.oid 
                AND con.contype = 'p' 
                AND a.attnum = ANY(con.conkey)
            ) as is_pk
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' 
        AND c.relkind = 'r'
        AND a.attnum > 0 
        AND NOT a.attisdropped
    ),
    fk_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', con.conname,
                    'column', col.attname,
                    'foreign_schema', fs.nspname,
                    'foreign_table', ft.relname,
                    'foreign_column', fcol.attname,
                    'on_delete', CASE con.confdeltype
                        WHEN 'a' THEN 'NO ACTION'
                        WHEN 'c' THEN 'CASCADE'
                        WHEN 'r' THEN 'RESTRICT'
                        WHEN 'n' THEN 'SET NULL'
                        WHEN 'd' THEN 'SET DEFAULT'
                        ELSE NULL
                    END
                )
            ) as foreign_keys
        FROM pg_class c
        JOIN pg_constraint con ON con.conrelid = c.oid
        JOIN pg_attribute col ON col.attrelid = con.conrelid AND col.attnum = ANY(con.conkey)
        JOIN pg_class ft ON ft.oid = con.confrelid
        JOIN pg_namespace fs ON fs.oid = ft.relnamespace
        JOIN pg_attribute fcol ON fcol.attrelid = con.confrelid AND fcol.attnum = ANY(con.confkey)
        WHERE con.contype = 'f'
        GROUP BY c.oid
    ),
    index_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', i.relname,
                    'using', am.amname,
                    'columns', (
                        SELECT jsonb_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum))
                        FROM unnest(ix.indkey) WITH ORDINALITY as u(attnum, ord)
                        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
                    )
                )
            ) as indexes
        FROM pg_class c
        JOIN pg_index ix ON ix.indrelid = c.oid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON am.oid = i.relam
        WHERE NOT ix.indisprimary
        GROUP BY c.oid
    ),
    policy_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', pol.polname,
                    'command', CASE pol.polcmd
                        WHEN 'r' THEN 'SELECT'
                        WHEN 'a' THEN 'INSERT'
                        WHEN 'w' THEN 'UPDATE'
                        WHEN 'd' THEN 'DELETE'
                        WHEN '*' THEN 'ALL'
                    END,
                    'roles', (
                        SELECT string_agg(quote_ident(r.rolname), ', ')
                        FROM pg_roles r
                        WHERE r.oid = ANY(pol.polroles)
                    ),
                    'using', pg_get_expr(pol.polqual, pol.polrelid),
                    'check', pg_get_expr(pol.polwithcheck, pol.polrelid)
                )
            ) as policies
        FROM pg_class c
        JOIN pg_policy pol ON pol.polrelid = c.oid
        GROUP BY c.oid
    ),
    trigger_info AS (
        SELECT 
            c.oid as table_oid,
            jsonb_agg(
                jsonb_build_object(
                    'name', t.tgname,
                    'timing', CASE 
                        WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                        WHEN t.tgtype & 4 = 4 THEN 'AFTER'
                        WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
                    END,
                    'events', (
                        CASE WHEN t.tgtype & 1 = 1 THEN 'INSERT'
                             WHEN t.tgtype & 8 = 8 THEN 'DELETE'
                             WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
                             WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
                        END
                    ),
                    'statement', pg_get_triggerdef(t.oid)
                )
            ) as triggers
        FROM pg_class c
        JOIN pg_trigger t ON t.tgrelid = c.oid
        WHERE NOT t.tgisinternal
        GROUP BY c.oid
    ),
    table_info AS (
        SELECT DISTINCT 
            c.table_oid,
            c.table_name,
            jsonb_agg(
                jsonb_build_object(
                    'name', c.column_name,
                    'type', c.column_type,
                    'notnull', c.notnull,
                    'default', c.column_default,
                    'identity', c.is_identity,
                    'is_pk', c.is_pk
                ) ORDER BY c.column_name
            ) as columns,
            COALESCE(fk.foreign_keys, '[]'::jsonb) as foreign_keys,
            COALESCE(i.indexes, '[]'::jsonb) as indexes,
            COALESCE(p.policies, '[]'::jsonb) as policies,
            COALESCE(t.triggers, '[]'::jsonb) as triggers
        FROM columns_info c
        LEFT JOIN fk_info fk ON fk.table_oid = c.table_oid
        LEFT JOIN index_info i ON i.table_oid = c.table_oid
        LEFT JOIN policy_info p ON p.table_oid = c.table_oid
        LEFT JOIN trigger_info t ON t.table_oid = c.table_oid
        GROUP BY c.table_oid, c.table_name, fk.foreign_keys, i.indexes, p.policies, t.triggers
    )
    SELECT result || jsonb_build_object(
        'tables',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', table_name,
                    'columns', columns,
                    'foreign_keys', foreign_keys,
                    'indexes', indexes,
                    'policies', policies,
                    'triggers', triggers
                )
            ),
            '[]'::jsonb
        )
    )
    FROM table_info
    INTO result;

    -- Get all functions
    WITH function_info AS (
        SELECT 
            p.proname AS name,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.prokind = 'f'
    )
    SELECT result || jsonb_build_object(
        'functions',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', name,
                    'definition', definition
                )
            ),
            '[]'::jsonb
        )
    )
    FROM function_info
    INTO result;

    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match("user" public.users, location extensions.geography)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
    raw_dist float;
    final_dist float;
begin
    raw_dist := extensions.st_distance("user".location, location);
    if raw_dist < 250 then
        final_dist := 0;
    else
        final_dist := round(raw_dist / 50.0) * 50;
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
        'user_id', "user".user_id,
        'title', "user".name || ', ' || extract(year from age(now(), "user".birth_date)),
        'image', "user".user_id || '/' || "user".image,
        'message', "user".message,
        'last_seen', "user".last_seen,
        'located_at', "user".coords ->> 'timestamp',
        'distance', final_dist,
        'subscribed', case when "user".subscription is null then false else true end,
        'is_for_kids', "user".is_for_kids
    ));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.others(user_id uuid, location extensions.geography DEFAULT NULL::extensions.geography)
 RETURNS TABLE(user_id uuid, "user" json, other_id uuid, is_visible boolean, distance integer, relevance_gender double precision, relevance_restiction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_subscription double precision, relevance_watchers double precision, relevance_state double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

with relations as (
  select
    other.user_id,
    row_to_json(other) "user",
    other.other_id,
    other.is_visible,
    extensions.st_distance(coalesce($2, me.location), other.location)::int as distance,
    case when
      (me.is_male and other.is_male and me.is_for_male and other.is_for_male) or
      (me.is_male and not other.is_male and me.is_for_female and other.is_for_male) or
      (not me.is_male and other.is_male and me.is_for_male and other.is_for_female) or
      (not me.is_male and not other.is_male and me.is_for_female and other.is_for_female) then 1 else 0 end relevance_gender,
    case when rest.user_id is null then 1 else 0 end relevance_restiction,
    greatest(0, least(extract(year from age(other.birth_date)) - (me.age_from - 1), (me.age_to + 1) - extract(year from age(other.birth_date)))
    / ((me.age_to + 1) - (me.age_from - 1))) +
    greatest(0, least(extract(year from age(me.birth_date)) - (other.age_from - 1), (other.age_to + 1) - extract(year from age(me.birth_date)))
    / ((other.age_to + 1) - (other.age_from - 1))) relevance_age,
    case when me.range = 0 then 0 else greatest(0, 1 - (extensions.st_distance(coalesce($2, me.location), other.location) / me.range)) / 2 end +
    case when other.range = 0 then 0 else greatest(0, 1 - (extensions.st_distance(coalesce($2, me.location), other.location) / other.range)) / 2 end relevance_location,
    greatest(0, 1 - ((extract(epoch from (now() - least(me.last_seen, other.last_seen))) / 60) / 60.0 / 24.0)) relevance_time,
    case when other.subscription is null then 0 else 1 end relevance_subscription,
    greatest(0, (3 - other.watchers_count) / 3) relevance_watchers,
    case when other.state = 'NONE' then 1 else 0 end relevance_state
  from public.users me
  inner join public.users other on other.user_id is distinct from me.user_id
  left join (
    select user_id, other_id from public.actions
    where (key = 'no' and created_at > now() - interval '1 day') or key = 'block' 
    group by user_id, other_id
  ) rest on (rest.user_id = me.user_id and rest.other_id = other.user_id) or (rest.other_id = me.user_id and rest.user_id = other.user_id)
  where me.user_id = $1
)

select *,
relevance_gender * relevance_restiction * relevance_age * relevance_location * relevance_time * relevance_subscription * relevance_watchers * relevance_state relevance 
from relations

$function$
;

CREATE OR REPLACE FUNCTION public.users()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare o public.users;
begin
    if tg_when = 'BEFORE' and tg_op = 'UPDATE' then
        if new.age_from < 18 then new.age_from := 18; end if;
        if new.age_from > new.age_to then new.age_to := new.age_from; end if;
        if new.updated_at is distinct from old.updated_at then
            if new.state in ('NONE','WATCHING','WAITING','REPLYING','CHAT') then
                if new.other_id is not null then 
                    select * into o from public.users where user_id = new.other_id;
                    new.match := match(o, new.location);
                else
                    new.match := null;
                end if;
            end if;
            if new.match is not null then
                new.watchers := '{}'::jsonb;
            else 
                select jsonb_object_agg(u.user_id, public.watcher(u, new.location::geometry))
                into new.watchers
                from public.users u
                where u.other_id = new.user_id;
            end if;
        end if;
        new.watchers_count := (select count(*) from jsonb_object_keys(coalesce(new.watchers, '{}'::jsonb)));
    end if;
    if tg_when = 'AFTER' and tg_op = 'UPDATE' then
        if new.updated_at is distinct from old.updated_at then
            update public.users set updated_at = new.updated_at where other_id = new.user_id;
            update public.users set updated_at = new.updated_at where user_id in (new.other_id, old.other_id);
        end if;
    end if;
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.watcher("user" public.users, location extensions.geography)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
    raw_dist float;
    final_dist float;
begin
    raw_dist := extensions.st_distance("user".location, location);
    if raw_dist < 250 then
        final_dist := 0;
    else
        final_dist := round(raw_dist / 50.0) * 50;
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
        'title', "user".name || ', ' || extract(year from age(now(), "user".birth_date)),
        'image', "user".user_id || '/' || "user".blurred,
        'last_seen', "user".last_seen,
        'distance', final_dist,
        'subscribed', case when "user".subscription is null then false else true end
    ));
end;
$function$
;

grant delete on table "public"."actions" to "anon";

grant insert on table "public"."actions" to "anon";

grant references on table "public"."actions" to "anon";

grant select on table "public"."actions" to "anon";

grant trigger on table "public"."actions" to "anon";

grant truncate on table "public"."actions" to "anon";

grant update on table "public"."actions" to "anon";

grant delete on table "public"."actions" to "authenticated";

grant insert on table "public"."actions" to "authenticated";

grant references on table "public"."actions" to "authenticated";

grant select on table "public"."actions" to "authenticated";

grant trigger on table "public"."actions" to "authenticated";

grant truncate on table "public"."actions" to "authenticated";

grant update on table "public"."actions" to "authenticated";

grant delete on table "public"."actions" to "service_role";

grant insert on table "public"."actions" to "service_role";

grant references on table "public"."actions" to "service_role";

grant select on table "public"."actions" to "service_role";

grant trigger on table "public"."actions" to "service_role";

grant truncate on table "public"."actions" to "service_role";

grant update on table "public"."actions" to "service_role";

grant delete on table "public"."chat" to "anon";

grant insert on table "public"."chat" to "anon";

grant references on table "public"."chat" to "anon";

grant select on table "public"."chat" to "anon";

grant trigger on table "public"."chat" to "anon";

grant truncate on table "public"."chat" to "anon";

grant update on table "public"."chat" to "anon";

grant delete on table "public"."chat" to "authenticated";

grant insert on table "public"."chat" to "authenticated";

grant references on table "public"."chat" to "authenticated";

grant select on table "public"."chat" to "authenticated";

grant trigger on table "public"."chat" to "authenticated";

grant truncate on table "public"."chat" to "authenticated";

grant update on table "public"."chat" to "authenticated";

grant delete on table "public"."chat" to "service_role";

grant insert on table "public"."chat" to "service_role";

grant references on table "public"."chat" to "service_role";

grant select on table "public"."chat" to "service_role";

grant trigger on table "public"."chat" to "service_role";

grant truncate on table "public"."chat" to "service_role";

grant update on table "public"."chat" to "service_role";

grant delete on table "public"."log" to "anon";

grant insert on table "public"."log" to "anon";

grant references on table "public"."log" to "anon";

grant select on table "public"."log" to "anon";

grant trigger on table "public"."log" to "anon";

grant truncate on table "public"."log" to "anon";

grant update on table "public"."log" to "anon";

grant delete on table "public"."log" to "authenticated";

grant insert on table "public"."log" to "authenticated";

grant references on table "public"."log" to "authenticated";

grant select on table "public"."log" to "authenticated";

grant trigger on table "public"."log" to "authenticated";

grant truncate on table "public"."log" to "authenticated";

grant update on table "public"."log" to "authenticated";

grant delete on table "public"."log" to "service_role";

grant insert on table "public"."log" to "service_role";

grant references on table "public"."log" to "service_role";

grant select on table "public"."log" to "service_role";

grant trigger on table "public"."log" to "service_role";

grant truncate on table "public"."log" to "service_role";

grant update on table "public"."log" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "related"
  on "public"."chat"
  as permissive
  for select
  to authenticated
using (((auth.uid() = user_id) OR (auth.uid() = other_id)));



  create policy "block"
  on "public"."log"
  as permissive
  for all
  to public
using (false);



  create policy "authenticated"
  on "public"."users"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));


CREATE TRIGGER users_after AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.users();

CREATE TRIGGER users_before BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.users();


  create policy "Update 1ufimg_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'users'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));



  create policy "Update 1ufimg_1"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'users'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));



  create policy "Update 1ufimg_2"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'users'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));



  create policy "Update 1ufimg_3"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'users'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));



  create policy "View 1ufimg_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'users'::text) AND (( SELECT (users.other_id)::text AS other_id
   FROM public.users
  WHERE (users.user_id = auth.uid())) = (storage.foldername(name))[1])));



  create policy "images 1ffg0oo_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'images'::text));



