alter table "public"."users" drop column "blurred";

alter table "public"."users" drop column "image";

alter table "public"."users" add column "images" jsonb;

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

  if me.state in ('HIDDEN','VISIBLE') then return null; end if;

  if me.state in ('WATCHING','REPLYING','WAITING') then
    return jsonb_strip_nulls(jsonb_build_object(
    'user_id', other.user_id,
    'title', other.name || ', ' || extract(year from age(now(), other.birth_date)),
    'images', other.user_id || '/' || other.images ->> 'normal',
    'message', other.message,
    'last_seen', other.last_seen,
    'located_at', other.coords ->> 'timestamp',
    'distance', final_dist,
    'subscribed', other.subscription is not null,
    'is_for_kids', other.is_for_kids,
    'is_male', other.is_male
  ));
  end if;

  if me.state in ('CHAT') then
    return jsonb_strip_nulls(jsonb_build_object(
    'user_id', other.user_id,
    'title', other.name || ', ' || extract(year from age(now(), other.birth_date)),
    'images', other.user_id || '/' || other.images ->> 'normal',
    'message', other.message,
    'last_seen', other.last_seen,
    'subscribed', other.subscription is not null,
    'is_for_kids', other.is_for_kids,
    'is_male', other.is_male
  ));
  end if;

  return jsonb_build_object(
      'user_id', me.match ->> 'user_id',
      'title', me.match ->> 'title',
      'images', me.match ->> 'images',
      'is_male', me.match ->> 'is_male'
    );
    
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
        'image', "user".user_id || '/blur/' || ("user".images->'blur'->> 0),
        'last_seen', "user".last_seen,
        'distance', final_dist,
        'subscribed', case when "user".subscription is null then false else true end,
        'is_male', "user".is_male
    ));
end;
$function$
;

drop policy "images 1ffg0oo_0" on "storage"."objects";


