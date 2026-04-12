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
  if me.state = 'CHAT' then final_dist := null; 
  else 
    select * into other from users where user_id = me.other_id;
    raw_dist := extensions.st_distance(me.location, other.location);
    if raw_dist < 250 then
      final_dist := 0;
    else
      final_dist := round(raw_dist / 50.0) * 50;
    end if;
  end if;

  if me.state in ('HIDDEN','VISIBLE') then return null; end if;

  if me.state in ('WATCHING','REPLYING','WAITING','CHAT') then
    return jsonb_strip_nulls(jsonb_build_object(
    'user_id', other.user_id,
    'title', other.name || ', ' || extract(year from age(now(), other.birth_date)),
    'images', other.images ->> 'normal',
    'message', other.message,
    'last_seen', other.last_seen,
    'distance', final_dist,
    'subscribed', other.subscription is not null,
    'is_for_kids', other.is_for_kids,
    'is_male', other.is_male,
    'created_at', case when me.match is null then now() else me.match ->> 'created_at' end
  ));
  end if;

  return jsonb_build_object(
      'user_id', me.match ->> 'user_id',
      'title', me.match ->> 'title',
      'images', me.match ->> 'images',
      'is_male', me.match ->> 'is_male',
      'created_at', me.created_at ->> 'created_at'
    );
    
end;
$function$
;


