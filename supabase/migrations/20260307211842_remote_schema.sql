drop function if exists "public"."match"("user" public.users, location extensions.geography);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match(me public.users)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  other public.users;
  raw_dist float;
  final_dist float;
begin
  select * into other from users where user_id = me.other_id;
  raw_dist := extensions.st_distance(me.location, other.location);
  if raw_dist < 250 then
    final_dist := 0;
  else
    final_dist := round(raw_dist / 50.0) * 50;
  end if;

  if me.state = 'NONE' then return null; end if;

  if me.state in ('WATCHING','REPLYING','WAITING','CHAT') then
    return jsonb_strip_nulls(jsonb_build_object(
    'user_id', other.user_id,
    'title', other.name || ', ' || extract(year from age(now(), other.birth_date)),
    'image', other.user_id || '/' || other.image,
    'message', other.message,
    'last_seen', other.last_seen,
    'located_at', other.coords ->> 'timestamp',
    'distance', final_dist,
    'subscribed', (other.subscription is not null),
    'is_for_kids', other.is_for_kids
  ));
  end if;

  return jsonb_build_object(
      'user_id', me.match ->> 'user_id',
      'title', me.match ->> 'title',
      'image', me.match ->> 'image'
    );
    
end;
$function$
;

CREATE OR REPLACE FUNCTION public.users()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    if tg_when = 'BEFORE' and tg_op = 'UPDATE' then
        if new.age_from < 18 then new.age_from := 18; end if;
        if new.age_from > new.age_to then new.age_to := new.age_from; end if;
        if new.updated_at is distinct from old.updated_at then
            new.match := match(new);
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


