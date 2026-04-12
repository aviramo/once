set check_function_bodies = off;

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

  if "user".state in ('NONE','REPLYING','WAITING','CHAT') then
    return jsonb_strip_nulls(jsonb_build_object(
    'user_id', "user".user_id,
    'title', "user".name || ', ' || extract(year from age(now(), "user".birth_date)),
    'image', "user".user_id || '/' || "user".image,
    'message', "user".message,
    'last_seen', "user".last_seen,
    'located_at', "user".coords ->> 'timestamp',
    'distance', final_dist,
    'subscribed', ("user".subscription is not null),
    'is_for_kids', "user".is_for_kids
  ));
  end if;

  return jsonb_build_object(
      'user_id', "user".user_id,
      'title', "user".name || ', ' || extract(year from age(now(), "user".birth_date)),
      'image', "user".user_id || '/' || "user".image
    );
    
end;
$function$
;


