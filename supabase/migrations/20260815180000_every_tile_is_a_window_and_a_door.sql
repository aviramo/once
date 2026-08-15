-- EVERY TILE ON THE ADMIN HOME IS A WINDOW, AND EVERY TILE IS A DOOR
-- (user directive 2026-08-15).
--
-- Two changes, and they are one change: the period picker moved out of the
-- activity section and into the header beside the environment switch, so it
-- now bounds EVERY figure on the screen; and every figure became pressable,
-- opening the rows it was counting.
--
-- ONE RULE FOR THE WHOLE PAGE: a tile counts what CAME INTO BEING inside the
-- window. An account is dated by when it was opened, a wallet by the account
-- that holds it, a device by the first time it was seen, an invitation by when
-- it was sent, an ending by when it ended. "All time" is therefore the state
-- of the world today, which is what the three snapshot sections used to show
-- unconditionally. Stated here because it is the only thing that makes a
-- demographic split and an event count legible on one screen under one picker.
--
-- And the second half is what forces the first: A TILE WHOSE NUMBER DISAGREES
-- WITH THE LIST IT OPENS IS A BUG. So `admin_activity_metrics` and
-- `admin_insight_rows` read the SAME source per metric, which is why the three
-- invitation outcomes move off `restrictions` and onto `watch`: only the watch
-- row knows when the invitation went out, so only it can say how long the
-- thing was in the air before it was answered, which is the whole reason to
-- open the list at all. `restrictions` records that a restriction now exists
-- between two people; it is not a history of invitations.

-- Two of the three metric functions gain a parameter, and a parameter is a new
-- SIGNATURE: `create or replace` would leave the old arity standing beside the
-- new one and PostgREST would have two candidates for one name. Dropped first,
-- explicitly, so there is exactly one of each.
drop function if exists public.admin_dashboard_metrics(uuid[], boolean);
drop function if exists public.admin_scan_metrics();

-- ---------------------------------------------------------------- parties --

-- The one description of a person a drill-down row carries. Every list on the
-- insight screen is built out of these, so a face and a name are assembled in
-- exactly one place and no branch below can decide to spell them differently.
-- It ALWAYS answers with an object, never with nothing: half of these lists
-- are about things that outlive an account (a report, a block, an invitation
-- somebody deleted themselves out of), and a missing second party must read as
-- "this person is gone" on the row rather than emptying the side of it.
create or replace function public._admin_party(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id',    u.user_id,
        'name',  u.name,
        'image', u.data->'images'->0->>'normal',
        'age',   case when u.birth_date is null then null
                 else floor(extract(year from age(now(), u.birth_date)))::int end
      )
      from public.users u
      where u.user_id = p_id
    ),
    jsonb_build_object('id', p_id, 'name', null, 'gone', true)
  )
$$;

revoke all on function public._admin_party(uuid) from public, anon, authenticated;
grant execute on function public._admin_party(uuid) to service_role;

-- A circle, in the shape a party takes, so a membership row can put one where
-- the second person stands and the renderer needs no second row type.
create or replace function public._admin_circle(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select jsonb_build_object('id', g.id, 'name', g.name, 'circle', true)
     from public.groups g where g.id = p_id),
    jsonb_build_object('id', p_id, 'name', null, 'circle', true, 'gone', true)
  )
$$;

revoke all on function public._admin_circle(uuid) from public, anon, authenticated;
grant execute on function public._admin_circle(uuid) to service_role;

-- ------------------------------------------------- the invitation, as one --

-- Every invitation the panel knows about, with its outcome and how long it
-- stood. ONE definition, read by the counter and by the list alike.
--
-- A row is an invitation only once `invited_at` is set — a watch row exists
-- from the moment somebody is put in front of somebody else, and most of them
-- are never acted on. The outcome is decided by the END reasons, terminal
-- ones first, because a side's reason is the last thing that happened to it:
-- a cancel that lands a second before an expiry is a cancel.
--
-- `air_ms` is the answer to "how long was it up there": from the moment it was
-- sent to the moment it was answered, and for one still in flight, to now.
create or replace view public.admin_invites as
  select
    w.watcher_id,
    w.target_id,
    w.invited_at,
    w.expires_at,
    w.ended_at,
    case
      when 'decline' in (w.watcher_reason, w.target_reason) then 'declined'
      when 'cancel'  in (w.watcher_reason, w.target_reason) then 'cancelled'
      when 'expire'  in (w.watcher_reason, w.target_reason) then 'expired'
      when w.state = 'chat'                                 then 'accepted'
      when w.ended_at is not null                           then 'ended'
      else 'pending'
    end as outcome,
    -- The moment the row is DATED by: an invitation still in the air is dated
    -- by its sending, an answered one by its answer. A window therefore holds
    -- an invitation once, under whichever of the two the operator is asking
    -- about (`sent` reads invited_at directly).
    coalesce(w.ended_at, w.invited_at) as at,
    (extract(epoch from (coalesce(w.ended_at, now()) - w.invited_at)) * 1000)::bigint as air_ms
  from public.watch w
  where w.invited_at is not null;

revoke all on public.admin_invites from public, anon, authenticated;
grant select on public.admin_invites to service_role;

-- --------------------------------------------------- conversations, as one --

-- A conversation is a PAIR that has ever said anything, dated by its first
-- line and measured by how many lines it holds. Both chat tiles read this, so
-- "conversations" and "average messages in one" describe the same set — they
-- used to be a count of accept calls beside an average over whoever happened
-- to type inside the window, which are two different populations wearing one
-- section heading.
create or replace view public.admin_chats as
  select
    least(c.user_id, c.other_id)    as a_id,
    greatest(c.user_id, c.other_id) as b_id,
    min(c.created_at)               as started_at,
    max(c.created_at)               as last_at,
    count(*) filter (where coalesce(c.is_event, false) = false) as messages
  from public.chat c
  group by least(c.user_id, c.other_id), greatest(c.user_id, c.other_id);

revoke all on public.admin_chats from public, anon, authenticated;
grant select on public.admin_chats to service_role;

-- ------------------------------------------------------------ the figures --

-- Everything that happened inside the window. Unchanged in shape; three of its
-- keys changed SOURCE (see the header) and two changed meaning with them.
create or replace function public.admin_activity_metrics(
  p_since timestamptz default null,
  p_is_test boolean default false,
  p_user_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with env as (
    select coalesce(array_agg(u.user_id), '{}'::uuid[]) as ids
    from public.users u
    where u.is_test = p_is_test
      and (p_user_ids is null or u.user_id = any(p_user_ids))
  )
  select jsonb_build_object(
    'active', (
      select count(*) from public.users
      where user_id = any(env.ids)
        and last_seen is not null
        and (p_since is null or last_seen >= p_since)
    ),
    'accounts', (
      select count(*) from public.users
      where user_id = any(env.ids)
        and (p_since is null or created_at >= p_since)
    ),
    'profiles', (
      select count(*) from (
        select l.user_id, min(l.created_at) as built_at
        from public.log l
        where l.user_id = any(env.ids)
          and jsonb_typeof(l.user->'data'->'images') = 'array'
          and jsonb_array_length(l.user->'data'->'images') >= 2
        group by l.user_id
      ) q
      where p_since is null or q.built_at >= p_since
    ),
    'friendships', (
      select count(*) from public.friend_links f
      where (f.a = any(env.ids) or f.b = any(env.ids))
        and (p_since is null or f.created_at >= p_since)
    ),
    'memberships', (
      select count(*) from public.user_groups ug
      where ug.user_id = any(env.ids)
        and (p_since is null or ug.created_at >= p_since)
    ),
    'invites_sent', (
      select count(*) from public.admin_invites i
      where (i.watcher_id = any(env.ids) or i.target_id = any(env.ids))
        and (p_since is null or i.invited_at >= p_since)
    ),
    'invites_declined', (
      select count(*) from public.admin_invites i
      where i.outcome = 'declined'
        and (i.watcher_id = any(env.ids) or i.target_id = any(env.ids))
        and (p_since is null or i.at >= p_since)
    ),
    'invites_cancelled', (
      select count(*) from public.admin_invites i
      where i.outcome = 'cancelled'
        and (i.watcher_id = any(env.ids) or i.target_id = any(env.ids))
        and (p_since is null or i.at >= p_since)
    ),
    'invites_expired', (
      select count(*) from public.admin_invites i
      where i.outcome = 'expired'
        and (i.watcher_id = any(env.ids) or i.target_id = any(env.ids))
        and (p_since is null or i.at >= p_since)
    ),
    'chats', (
      select count(*) from public.admin_chats c
      where (c.a_id = any(env.ids) or c.b_id = any(env.ids))
        and (p_since is null or c.started_at >= p_since)
    ),
    'avg_messages', (
      select coalesce(round(avg(c.messages)::numeric, 1), 0)
      from public.admin_chats c
      where (c.a_id = any(env.ids) or c.b_id = any(env.ids))
        and (p_since is null or c.started_at >= p_since)
    ),
    'blocks', (
      select count(*) from public.restrictions
      where key = 'block' and user_id = any(env.ids)
        and (p_since is null or created_at >= p_since)
    ),
    'reports', (
      select count(*) from public.reports
      where reporter_id = any(env.ids)
        and (p_since is null or created_at >= p_since)
    ),
    'logouts', (
      select count(*) from public.log
      where key = 'logout' and status < 400 and user_id = any(env.ids)
        and (p_since is null or created_at >= p_since)
    ),
    -- THE ARCHIVE IS THE RECORD OF A DELETION, not the log line that reported
    -- one: `archive.accounts` holds the profile that stood behind the account
    -- and survives the log's own pruning, which is what makes the tile
    -- openable at all. Log rows from before the archive existed are counted
    -- beside it, by a user id the archive has never heard of, so the figure
    -- does not fall the day the archive was introduced.
    'deletes', (
      select
        (select count(*) from archive.accounts a
         where coalesce((a.snapshot->>'is_test')::boolean, false) = p_is_test
           and (p_user_ids is null or a.user_id = any(p_user_ids))
           and (p_since is null or a.deleted_at >= p_since))
      + (select count(*) from public.log l
         where l.key = 'delete' and l.status < 400
           and coalesce((l.user->>'is_test')::boolean, false) = p_is_test
           and (p_user_ids is null or l.user_id = any(p_user_ids))
           and not exists (select 1 from archive.accounts a where a.user_id = l.user_id)
           and (p_since is null or l.created_at >= p_since))
    )
  )
  from env
$$;

revoke all on function public.admin_activity_metrics(timestamptz, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_activity_metrics(timestamptz, boolean, uuid[]) to service_role;

-- The snapshot sections, now bounded by the same window. `p_since` is an
-- ADDED parameter with a default, so a caller that has not been redeployed
-- still gets the whole-history picture it always got.
create or replace function public.admin_dashboard_metrics(
  p_user_ids uuid[] default null,
  p_is_test boolean default false,
  p_since timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with env as (
    -- The window is applied HERE, once, on the account's own birthday, so
    -- every figure below is a fact about the same set of people: the ones who
    -- arrived inside the period. A wallet has no birthday of its own — it is
    -- the account's — which is what makes one rule cover both sections.
    select coalesce(array_agg(u.user_id), '{}'::uuid[]) as ids
    from public.users u
    where u.is_test = p_is_test
      and (p_user_ids is null or u.user_id = any(p_user_ids))
      and (p_since is null or u.created_at >= p_since)
  )
  select jsonb_build_object(
    'demographics', jsonb_build_object(
      'men',   (select count(*) from public.users where is_male = true  and user_id = any(env.ids)),
      'women', (select count(*) from public.users where is_male = false and user_id = any(env.ids)),
      'avg_age', (select coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        from public.users where birth_date is not null and user_id = any(env.ids)),
      'os_ios',     (select count(*) from public.users where data->>'os' = 'ios'     and user_id = any(env.ids)),
      'os_android', (select count(*) from public.users where data->>'os' = 'android' and user_id = any(env.ids))
    ),
    'users', jsonb_build_object(
      'total',         (select count(*) from public.users where user_id = any(env.ids)),
      'online_5m',     (select count(*) from public.users where last_seen > now() - interval '5 minutes' and user_id = any(env.ids)),
      'with_location', (select count(*) from public.users where location is not null and user_id = any(env.ids))
    ),
    'credits', jsonb_build_object(
      'balance_total', (select coalesce(sum((relations->'credits'->>'balance')::int), 0)
        from public.users where relations->'credits'->>'balance' ~ '^[0-9]+$' and user_id = any(env.ids)),
      'held_total', (select coalesce(sum((relations->'credits'->>'held')::int), 0)
        from public.users where relations->'credits'->>'held' ~ '^[0-9]+$' and user_id = any(env.ids)),
      'extra_total', (select coalesce(sum((relations->'credits'->>'extra')::int), 0)
        from public.users where relations->'credits'->>'extra' ~ '^[0-9]+$' and user_id = any(env.ids)),
      'with_extra', (select count(*) from public.users
        where relations->'credits'->>'extra' ~ '^[0-9]+$'
          and (relations->'credits'->>'extra')::int > 0
          and user_id = any(env.ids))
    )
  )
  from env
$$;

revoke all on function public.admin_dashboard_metrics(uuid[], boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics(uuid[], boolean, timestamptz) to service_role;

-- The printed card and the home page, bounded by the same window — a device is
-- dated by the FIRST time it was seen, which is the only thing on this block
-- that "came into being" at all. `hits` and the three presses stay whole:
-- they are what that device has done since, not a second population.
create or replace function public.admin_scan_metrics(
  p_since timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with per as (
    select
      source,
      platform,
      count(*)                                         as devices,
      count(*) filter (where downloaded_at is not null) as download,
      count(*) filter (where notified_at   is not null) as notify,
      count(*) filter (where more_at       is not null) as more,
      coalesce(sum(hits), 0)                           as hits
    from public.scan_devices
    where p_since is null or first_seen_at >= p_since
    group by source, platform
  ),
  shaped as (
    select
      source,
      jsonb_object_agg(
        platform,
        jsonb_build_object(
          'devices', devices, 'download', download,
          'notify', notify, 'more', more, 'hits', hits
        )
      ) as by_platform
    from per
    group by source
  ),
  base as (
    select jsonb_build_object(
      'android', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'ios',     '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'desktop', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb
    ) as b
  )
  select
    (select b from base)
    || coalesce((select by_platform from shaped where source = 'card'), '{}'::jsonb)
    || jsonb_build_object(
         'site',
         (select b from base)
         || coalesce((select by_platform from shaped where source = 'site'), '{}'::jsonb)
       );
$$;

revoke all on function public.admin_scan_metrics(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_scan_metrics(timestamptz) to service_role;

-- ---------------------------------------------------------- the drill-down --

-- THE ROWS BEHIND ONE TILE. One function for every tile on the admin home,
-- because there are only THREE shapes of answer and a screen per number would
-- be thirty screens saying the same three things:
--
--   `person` — one account. Who arrived, who was active, who signed out, who
--              deleted, whose wallet holds what. `b` is empty.
--   `pair`   — two parties and what passed between them, with a duration or a
--              count on it. An invitation, a conversation, a block, a report,
--              a friendship — and a circle joining, where the second party is
--              a CIRCLE rather than a person, which is why `_admin_circle`
--              answers in the same shape a person does.
--   `device` — an anonymous visitor to the card or the home page. No account,
--              no environment, so this shape ignores both.
--
-- Every row carries `at` (the moment it is dated by, which is the same moment
-- the tile counted it under), an optional `tag` the panel translates, an
-- optional `ms` (how long something stood) and an optional `n` (how many).
create or replace function public.admin_insight_rows(
  p_metric text,
  p_since timestamptz default null,
  p_is_test boolean default false,
  p_user_ids uuid[] default null,
  p_limit int default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  ids   uuid[];
  lim   int := least(greatest(coalesce(p_limit, 300), 1), 1000);
  rows  jsonb;
begin
  select coalesce(array_agg(u.user_id), '{}'::uuid[]) into ids
  from public.users u
  where u.is_test = p_is_test
    and (p_user_ids is null or u.user_id = any(p_user_ids));

  -- ---- people, by the window their account was opened in -------------------
  if p_metric in ('total', 'men', 'women', 'avgAge', 'osIos', 'osAndroid',
                  'aAccounts', 'aActive',
                  'balanceTotal', 'heldTotal', 'extraTotal', 'withExtra') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'person',
        -- `aActive` is the one person metric dated by something other than the
        -- account's birthday: it counts a visit, so it is dated by the visit.
        'at',   case when p_metric = 'aActive' then u.last_seen else u.created_at end,
        'a',    public._admin_party(u.user_id),
        'n',    case
                  when p_metric = 'balanceTotal' then (u.relations->'credits'->>'balance')::int
                  when p_metric = 'heldTotal'    then (u.relations->'credits'->>'held')::int
                  when p_metric in ('extraTotal', 'withExtra') then (u.relations->'credits'->>'extra')::int
                  else null
                end,
        'tag',  case
                  when p_metric in ('balanceTotal','heldTotal','extraTotal','withExtra') then 'credits'
                  else null
                end
      ) as r
      from public.users u
      where u.user_id = any(ids)
        and (
          case p_metric
            when 'men'          then u.is_male is true
            when 'women'        then u.is_male is false
            when 'avgAge'       then u.birth_date is not null
            when 'osIos'        then u.data->>'os' = 'ios'
            when 'osAndroid'    then u.data->>'os' = 'android'
            when 'aActive'      then u.last_seen is not null
            when 'balanceTotal' then u.relations->'credits'->>'balance' ~ '^[1-9][0-9]*$'
            when 'heldTotal'    then u.relations->'credits'->>'held'    ~ '^[1-9][0-9]*$'
            when 'extraTotal'   then u.relations->'credits'->>'extra'   ~ '^[1-9][0-9]*$'
            when 'withExtra'    then u.relations->'credits'->>'extra'   ~ '^[1-9][0-9]*$'
            else true
          end
        )
        and (
          p_since is null
          or (case when p_metric = 'aActive' then u.last_seen else u.created_at end) >= p_since
        )
      order by (case when p_metric = 'aActive' then u.last_seen else u.created_at end) desc
      limit lim
    ) q;

  -- ---- the profile being finished -----------------------------------------
  -- Dated by the first log line that carries two photographs, which is what
  -- the counter reads. The log is pruned, so an old account whose build fell
  -- outside the retained window is simply not here — the same blind spot the
  -- tile has, which is the point.
  elsif p_metric = 'aProfiles' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'person', 'at', q.built_at, 'a', public._admin_party(q.user_id)
      ) as r
      from (
        select l.user_id, min(l.created_at) as built_at
        from public.log l
        where l.user_id = any(ids)
          and jsonb_typeof(l.user->'data'->'images') = 'array'
          and jsonb_array_length(l.user->'data'->'images') >= 2
        group by l.user_id
      ) q
      where p_since is null or q.built_at >= p_since
      order by q.built_at desc
      limit lim
    ) s;

  -- ---- signing out ---------------------------------------------------------
  elsif p_metric = 'aLogouts' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'person', 'at', l.created_at, 'a', public._admin_party(l.user_id)
      ) as r
      from public.log l
      where l.key = 'logout' and l.status < 400 and l.user_id = any(ids)
        and (p_since is null or l.created_at >= p_since)
      order by l.created_at desc
      limit lim
    ) s;

  -- ---- accounts that are gone ---------------------------------------------
  -- THE PROFILE THAT STOOD BEHIND THE ACCOUNT IS IN THE ARCHIVE, and this is
  -- the one list in the panel whose people cannot be opened: there is no page
  -- to open. So the row carries the snapshot itself — the name, the age, the
  -- photographs — and says when it was deleted and when the archive will let
  -- go of it. `image` is a full storage path in the PRIVATE `users-archive`
  -- bucket, unlike a live person's bare filename, which is why the row states
  -- `archived` and the panel signs the URL rather than composing it.
  elsif p_metric = 'aDeletes' then
    select coalesce(jsonb_agg(s.r order by s.at desc), '[]'::jsonb) into rows
    from (
      select a.deleted_at as at, jsonb_build_object(
        'kind', 'person',
        'at',   a.deleted_at,
        'a',    jsonb_build_object(
                  'id',    a.user_id,
                  'name',  a.snapshot->>'name',
                  'image', a.images->>0,
                  'age',   case when a.snapshot->>'birth_date' is null then null
                           else floor(extract(year from age(now(), (a.snapshot->>'birth_date')::date)))::int end,
                  'archived', true,
                  'photos', coalesce(jsonb_array_length(a.images), 0),
                  'joined', a.snapshot->>'created_at'
                ),
        'tag',  case when a.purged_at is null then 'archived' else 'purged' end,
        'n',    coalesce(jsonb_array_length(a.images), 0)
      ) as r
      from archive.accounts a
      where coalesce((a.snapshot->>'is_test')::boolean, false) = p_is_test
        and (p_user_ids is null or a.user_id = any(p_user_ids))
        and (p_since is null or a.deleted_at >= p_since)

      union all

      -- Deleted before the archive existed: the account is a name in the log
      -- and nothing more, which the row says by carrying no photographs.
      select l.created_at as at, jsonb_build_object(
        'kind', 'person',
        'at',   l.created_at,
        'a',    jsonb_build_object(
                  'id',    l.user_id,
                  'name',  l.user->>'name',
                  'image', null,
                  'archived', true,
                  'photos', 0
                ),
        'tag',  'gone'
      ) as r
      from public.log l
      where l.key = 'delete' and l.status < 400
        and coalesce((l.user->>'is_test')::boolean, false) = p_is_test
        and (p_user_ids is null or l.user_id = any(p_user_ids))
        and not exists (select 1 from archive.accounts a where a.user_id = l.user_id)
        and (p_since is null or l.created_at >= p_since)
      order by 1 desc
      limit lim
    ) s;

  -- ---- invitations ---------------------------------------------------------
  -- Four tiles, one list. `aInvites` is every invitation that went out in the
  -- window whatever became of it; the other three are that same list filtered
  -- to one ending and dated by the ending instead of the sending.
  elsif p_metric in ('aInvites', 'aDeclined', 'aCancelled', 'aExpired') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair',
        'at',   case when p_metric = 'aInvites' then i.invited_at else i.at end,
        'a',    public._admin_party(i.watcher_id),
        'b',    public._admin_party(i.target_id),
        'tag',  i.outcome,
        'ms',   i.air_ms,
        -- Whether the clock was still running when it was answered. An
        -- invitation lives ten minutes, so "declined after nine" and
        -- "declined after four" are two different things to read.
        'note', i.expires_at
      ) as r
      from public.admin_invites i
      where (i.watcher_id = any(ids) or i.target_id = any(ids))
        and (case p_metric
               when 'aDeclined'  then i.outcome = 'declined'
               when 'aCancelled' then i.outcome = 'cancelled'
               when 'aExpired'   then i.outcome = 'expired'
               else true
             end)
        and (
          p_since is null
          or (case when p_metric = 'aInvites' then i.invited_at else i.at end) >= p_since
        )
      order by (case when p_metric = 'aInvites' then i.invited_at else i.at end) desc
      limit lim
    ) s;

  -- ---- conversations -------------------------------------------------------
  -- Both chat tiles open the same list: the count asks how many there were,
  -- the average asks how long they ran, and the answer to both is the
  -- conversations themselves with their depth written on each.
  elsif p_metric in ('aChats', 'aAvgMessages') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair',
        'at',   c.started_at,
        'a',    public._admin_party(c.a_id),
        'b',    public._admin_party(c.b_id),
        'tag',  'messages',
        'n',    c.messages,
        -- How long the conversation went on for, which is the other half of
        -- how deep it got.
        'ms',   (extract(epoch from (c.last_at - c.started_at)) * 1000)::bigint
      ) as r
      from public.admin_chats c
      where (c.a_id = any(ids) or c.b_id = any(ids))
        and (p_since is null or c.started_at >= p_since)
      order by c.started_at desc
      limit lim
    ) s;

  -- ---- what went wrong -----------------------------------------------------
  elsif p_metric = 'aBlocks' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair', 'at', x.created_at,
        'a', public._admin_party(x.user_id),
        'b', public._admin_party(x.other_id),
        'tag', 'block'
      ) as r
      from public.restrictions x
      where x.key = 'block' and x.user_id = any(ids)
        and (p_since is null or x.created_at >= p_since)
      order by x.created_at desc
      limit lim
    ) s;

  elsif p_metric = 'aReports' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair', 'at', x.created_at,
        'a', public._admin_party(x.reporter_id),
        'b', public._admin_party(x.reported_id),
        'tag', coalesce(x.reason, 'report'),
        'note', x.note
      ) as r
      from public.reports x
      where x.reporter_id = any(ids)
        and (p_since is null or x.created_at >= p_since)
      order by x.created_at desc
      limit lim
    ) s;

  -- ---- the social graph ----------------------------------------------------
  elsif p_metric = 'aFriendships' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair', 'at', f.created_at,
        'a', public._admin_party(f.a),
        'b', public._admin_party(f.b),
        'tag', coalesce(f.via, 'friend')
      ) as r
      from public.friend_links f
      where (f.a = any(ids) or f.b = any(ids))
        and (p_since is null or f.created_at >= p_since)
      order by f.created_at desc
      limit lim
    ) s;

  elsif p_metric = 'aMemberships' then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair', 'at', ug.created_at,
        'a', public._admin_party(ug.user_id),
        'b', public._admin_circle(ug.group_id),
        'tag', 'joined'
      ) as r
      from public.user_groups ug
      where ug.user_id = any(ids)
        and (p_since is null or ug.created_at >= p_since)
      order by ug.created_at desc
      limit lim
    ) s;

  -- ---- devices -------------------------------------------------------------
  -- No account behind these, so no environment and no manager scope: an
  -- anonymous visitor to a printed address belongs to neither world. The
  -- panel already draws these two blocks in production only.
  elsif p_metric in ('scanAndroid', 'scanIos',
                     'siteTotal', 'siteAndroid', 'siteIos', 'siteDesktop') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'device',
        'at',   d.first_seen_at,
        'a',    jsonb_build_object('id', d.device_id, 'name', d.platform, 'device', true),
        'tag',  d.platform,
        'n',    d.hits,
        'note', concat_ws(',',
                  case when d.downloaded_at is not null then 'download' end,
                  case when d.notified_at   is not null then 'notify'   end,
                  case when d.more_at       is not null then 'more'     end),
        'ms',   (extract(epoch from (d.last_seen_at - d.first_seen_at)) * 1000)::bigint
      ) as r
      from public.scan_devices d
      where d.source = (case when p_metric like 'scan%' then 'card' else 'site' end)
        and (case p_metric
               when 'scanAndroid' then d.platform = 'android'
               when 'scanIos'     then d.platform = 'ios'
               when 'siteAndroid' then d.platform = 'android'
               when 'siteIos'     then d.platform = 'ios'
               when 'siteDesktop' then d.platform = 'desktop'
               else true
             end)
        and (p_since is null or d.first_seen_at >= p_since)
      order by d.first_seen_at desc
      limit lim
    ) s;

  else
    rows := null;
  end if;

  -- `null` is "there is no such tile", which the panel answers with a 404;
  -- `[]` is "that tile is empty in this window", which is a page saying so.
  return rows;
end
$$;

revoke all on function public.admin_insight_rows(text, timestamptz, boolean, uuid[], int) from public, anon, authenticated;
grant execute on function public.admin_insight_rows(text, timestamptz, boolean, uuid[], int) to service_role;
