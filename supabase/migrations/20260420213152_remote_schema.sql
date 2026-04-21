alter table "public"."users" drop constraint "location_valid";

alter table "public"."users" drop constraint "state_valid";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.others(me public.users)
 RETURNS TABLE(user_id uuid, "user" json, other_id uuid, distance integer, state text, relevance_gender double precision, relevance_restiction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

with
me_location as (
  select (me).location::extensions.geography as loc
),
relations as (
  select
    other.user_id,
    row_to_json(other) "user",
    other.other_id,
    extensions.st_distance((select loc from me_location), other.location)::int as distance,
    other.state,
    case when
      ((me).is_male and other.is_male and (me).is_for_male and other.is_for_male) or
      ((me).is_male and not other.is_male and (me).is_for_female and other.is_for_male) or
      (not (me).is_male and other.is_male and (me).is_for_male and other.is_for_female) or
      (not (me).is_male and not other.is_male and (me).is_for_female and other.is_for_female) then 1 else 0 end relevance_gender,
    case when rest.user_id is null then 1 else 0 end relevance_restiction,
    greatest(0, least(extract(year from age(other.birth_date)) - ((me).age_from - 1), ((me).age_to + 1) - extract(year from age(other.birth_date)))
    / (((me).age_to + 1) - ((me).age_from - 1))) *
    greatest(0, least(extract(year from age((me).birth_date)) - (other.age_from - 1), (other.age_to + 1) - extract(year from age((me).birth_date)))
    / ((other.age_to + 1) - (other.age_from - 1))) relevance_age,
    case when (me).range = 0 then 0 else greatest(0, 1 - (extensions.st_distance((select loc from me_location), other.location) / (me).range)) / 2 end +
    case when other.range = 0 then 0 else greatest(0, 1 - (extensions.st_distance((select loc from me_location), other.location) / other.range)) / 2 end relevance_location,
    greatest(0, 1 - ((extract(epoch from (now() - least((me).last_seen, other.last_seen))) / 60) / 60.0 / 24.0 / 365)) relevance_time,
    (5 - coalesce((select count(*) from jsonb_each(other.watchers))::int, 0)) / 5.0 relevance_watchers
  from public.users other
  left join (
    select user_id, other_id from public.actions
    where (key in ('ignore', 'cancel', 'leave') and created_at > now() - interval '1 day') or key = 'block' 
    group by user_id, other_id
  ) rest on (rest.user_id = (me).user_id and rest.other_id = other.user_id) or (rest.other_id = (me).user_id and rest.user_id = other.user_id)
  where other.user_id is distinct from (me).user_id
)

select *,
relevance_gender * relevance_restiction * relevance_age * relevance_location * relevance_time * relevance_watchers relevance 
from relations

$function$
;


