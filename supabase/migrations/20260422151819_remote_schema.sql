
  create table "public"."restrictions" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid not null,
    "other_id" uuid not null,
    "key" text not null
      );


alter table "public"."restrictions" enable row level security;

alter table "public"."users" drop column "match";

alter table "public"."users" drop column "watchers";

alter table "public"."users" add column "is_visible" boolean not null default true;

alter table "public"."users" add column "relations" jsonb;

CREATE UNIQUE INDEX restrictions_pkey ON public.restrictions USING btree (id);

alter table "public"."restrictions" add constraint "restrictions_pkey" PRIMARY KEY using index "restrictions_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.others(me public.users)
 RETURNS TABLE(user_id uuid, "user" json, other_id uuid, distance integer, state text, relevance_gender double precision, relevance_restiction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

with
relations as (
  select
    other.user_id,
    row_to_json(other) "user",
    other.other_id,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int as distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) as dist_meters,
    other.range as other_range,
    other.state,
    case when
      ((me).is_male and other.is_male and (me).is_for_male and other.is_for_male) or
      ((me).is_male and not other.is_male and (me).is_for_female and other.is_for_male) or
      (not (me).is_male and other.is_male and (me).is_for_male and other.is_for_female) or
      (not (me).is_male and not other.is_male and (me).is_for_female and other.is_for_female) then 1 else 0 end relevance_gender,
    case when rest.user_id is null then 1 else 0 end relevance_restiction,
    (case when (me).age_from = (me).age_to
      then case when extract(year from age(other.birth_date)) = (me).age_from then 1.0 else 0.0 end
      else greatest(0.0, 1 - abs(extract(year from age(other.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    end)
    *
    (case when other.age_from = other.age_to
      then case when extract(year from age((me).birth_date)) = other.age_from then 1.0 else 0.0 end
      else greatest(0.0, 1 - abs(extract(year from age((me).birth_date)) - (other.age_from + other.age_to) / 2.0) / ((other.age_to - other.age_from) / 2.0))
    end) relevance_age,
    greatest(0.0, 1 - (extract(epoch from (now() - other.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) relevance_time,
    greatest(0.0, (5 - coalesce((select count(*) from jsonb_each(other.watchers))::int, 0)) / 5.0) relevance_watchers
  from public.users other
  left join (
    select user_id, other_id from public.restrictions
    where (key in ('ignore', 'refuse', 'cancel', 'leave') and created_at > now() - interval '1 day') or key = 'block'
    group by user_id, other_id
  ) rest on (rest.user_id = (me).user_id and rest.other_id = other.user_id) or (rest.other_id = (me).user_id and rest.user_id = other.user_id)
  where other.user_id is distinct from (me).user_id
)

select
  user_id,
  "user",
  other_id,
  distance,
  state,
  relevance_gender,
  relevance_restiction,
  relevance_age,
  (case when (me).range is null then 1.0 else greatest(0.0, 1 - dist_meters / (me).range) end)
  *
  (case when other_range is null then 1.0 else greatest(0.0, 1 - dist_meters / other_range) end) relevance_location,
  relevance_time,
  relevance_watchers,
  relevance_gender * relevance_restiction * relevance_age *
  (case when (me).range is null then 1.0 else greatest(0.0, 1 - dist_meters / (me).range) end)
  *
  (case when other_range is null then 1.0 else greatest(0.0, 1 - dist_meters / other_range) end)
  * relevance_time * relevance_watchers relevance
from relations

$function$
;

grant delete on table "public"."restrictions" to "anon";

grant insert on table "public"."restrictions" to "anon";

grant references on table "public"."restrictions" to "anon";

grant select on table "public"."restrictions" to "anon";

grant trigger on table "public"."restrictions" to "anon";

grant truncate on table "public"."restrictions" to "anon";

grant update on table "public"."restrictions" to "anon";

grant delete on table "public"."restrictions" to "authenticated";

grant insert on table "public"."restrictions" to "authenticated";

grant references on table "public"."restrictions" to "authenticated";

grant select on table "public"."restrictions" to "authenticated";

grant trigger on table "public"."restrictions" to "authenticated";

grant truncate on table "public"."restrictions" to "authenticated";

grant update on table "public"."restrictions" to "authenticated";

grant delete on table "public"."restrictions" to "service_role";

grant insert on table "public"."restrictions" to "service_role";

grant references on table "public"."restrictions" to "service_role";

grant select on table "public"."restrictions" to "service_role";

grant trigger on table "public"."restrictions" to "service_role";

grant truncate on table "public"."restrictions" to "service_role";

grant update on table "public"."restrictions" to "service_role";


