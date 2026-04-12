create or replace function watcher ("user" public.users, location extensions.geography) returns jsonb as $$
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
        'image', "user".images->'blur'->> 0,
        'last_seen', "user".last_seen,
        'distance', final_dist,
        'subscribed', case when "user".subscription is null then false else true end,
        'is_male', "user".is_male
    ));
end;
$$ language plpgsql;