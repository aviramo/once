create or replace function public.users () returns trigger language plpgsql as $$
begin
    if tg_when = 'BEFORE' and tg_op = 'UPDATE' then
        if new.age_from < 18 then new.age_from := 18; end if;
        if new.age_from > new.age_to then new.age_to := new.age_from; end if;
        if new.state = 'VISIBLE' then new.other_id = null; end if;
        if new.updated_at is distinct from old.updated_at then
            new.match := match(new);
            if new.state is distinct from 'HIDDEN' then
                select coalesce(jsonb_object_agg(u.user_id, public.watcher(u, new.location::geometry)), '{}'::jsonb)
                into new.watchers
                from public.users u
                where u.other_id = new.user_id;
            else 
                new.watchers := '{}'::jsonb;
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
$$;