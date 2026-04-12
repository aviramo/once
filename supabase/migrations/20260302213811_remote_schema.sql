alter table "public"."users" drop column "watchers_count";

alter table "public"."users" add column "units" text;

set check_function_bodies = off;

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


