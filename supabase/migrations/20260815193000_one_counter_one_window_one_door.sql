-- The home-page counter and the window-and-door change were authored in
-- parallel and landed in the same commit, so they crossed: the counter's own
-- migration re-created `admin_scan_metrics()` at its original arity after the
-- window change had replaced it with a `p_since` one, leaving the database
-- holding TWO functions of that name. PostgREST resolves an overload by
-- argument NAMES, so both calls happened to keep working — which is exactly
-- why this would have sat there unnoticed until somebody added a parameter and
-- got an ambiguity error out of a call they had not touched.
--
-- One function, with the window on it. The panel calls it with no arguments
-- and the default answers as the whole history, so nothing has to be deployed
-- in step with this.
drop function if exists public.admin_scan_metrics();
drop function if exists public.admin_scan_metrics(timestamptz);

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
    -- A device is dated by the FIRST time it was seen, which is the only thing
    -- in this block that came into being at all; the presses it made since are
    -- counted whole, being what that device has done rather than a second
    -- population with a birthday of its own.
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

-- And the drill-down follows the tiles it opens. The site block is three
-- figures now — who came, who pressed download, who asked to be told about an
-- iPhone — where it used to be a tile per platform, so the device branch is
-- keyed on the ACT rather than on the operating system. What each of the three
-- opens is the same list of visitors, filtered to the ones who did that thing.
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
  elsif p_metric in ('aInvites', 'aDeclined', 'aCancelled', 'aExpired') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'pair',
        'at',   case when p_metric = 'aInvites' then i.invited_at else i.at end,
        'a',    public._admin_party(i.watcher_id),
        'b',    public._admin_party(i.target_id),
        'tag',  i.outcome,
        -- How long it stood, which is the whole reason to open this list. The
        -- expiry itself is deliberately NOT carried: `note` is free text a
        -- person wrote (a report's own words) and a timestamp riding in the
        -- same field would have to be told apart by looking at it.
        'ms',   i.air_ms
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
  -- anonymous visitor to a public page belongs to neither world. The three
  -- metrics are one list under three filters — everyone who came, and the two
  -- things there are to press once here.
  elsif p_metric in ('siteTotal', 'siteDownload', 'siteNotify') then
    select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
        'kind', 'device',
        'at',   d.first_seen_at,
        'a',    jsonb_build_object('id', d.device_id, 'name', d.platform, 'device', true),
        'tag',  d.platform,
        'n',    d.hits,
        -- What this visitor went on to press, in the order the page offers it.
        'note', nullif(concat_ws(',',
                  case when d.downloaded_at is not null then 'download' end,
                  case when d.notified_at   is not null then 'notify'   end,
                  case when d.more_at       is not null then 'more'     end), ''),
        -- First sight to last: whether this was one look or somebody who kept
        -- coming back to a page that has nothing to install yet.
        'ms',   (extract(epoch from (d.last_seen_at - d.first_seen_at)) * 1000)::bigint
      ) as r
      from public.scan_devices d
      where (case p_metric
               when 'siteDownload' then d.downloaded_at is not null
               when 'siteNotify'   then d.notified_at   is not null
               else true
             end)
        and (p_since is null or d.first_seen_at >= p_since)
      order by d.first_seen_at desc
      limit lim
    ) s;

  else
    rows := null;
  end if;

  return rows;
end
$$;

revoke all on function public.admin_insight_rows(text, timestamptz, boolean, uuid[], int) from public, anon, authenticated;
grant execute on function public.admin_insight_rows(text, timestamptz, boolean, uuid[], int) to service_role;
