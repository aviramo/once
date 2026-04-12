alter table "public"."users" add column "is_active" boolean not null default false;

alter table "public"."users" add column "is_location_active" boolean default false;

alter table "public"."users" alter column "watchers" set default '{}'::jsonb;

alter table "public"."users" alter column "watchers" set not null;

set check_function_bodies = off;

DROP FUNCTION public.others;

CREATE OR REPLACE FUNCTION public.others(user_id uuid, location extensions.geography)
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
    extensions.st_distance($2, other.location)::int as distance,
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
    (3 - coalesce((select count(*) from jsonb_each(other.watchers))::int, 0)) / 3.0 relevance_watchers,
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
                select coalesce(jsonb_object_agg(u.user_id, public.watcher(u, new.location::geometry)), '{}'::jsonb)
                into new.watchers
                from public.users u
                where u.other_id = new.user_id;
            end if;
        end if;
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
        'image', "user".user_id || '/blurred/' || "user".blurred,
        'last_seen', "user".last_seen,
        'distance', final_dist,
        'subscribed', case when "user".subscription is null then false else true end
    ));
end;
$function$
;


