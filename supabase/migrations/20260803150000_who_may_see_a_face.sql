-- WHO MAY SEE A FACE.
--
-- Phase 1 of docs/PRIVATE_PHOTOS_PLAN.md, and it is INERT on arrival: the `users`
-- bucket is still public, so nothing consults this yet. It is deployed early and
-- alone precisely so it can be tested against real rows without a single photo
-- depending on it being right.
--
-- The question it answers is the one the whole feature turns on — may this
-- viewer see that owner's photographs — and the answer is not in one place,
-- because being able to see someone is not one thing in this app. Every branch
-- below is a surface that draws a face today; the list was read off the code, not
-- imagined, and the last one was a surprise (see PUBLIC CIRCLE OWNERS).
--
-- WHAT IS DELIBERATELY NOT HERE: `restrictions`. A block stops the two of you
-- meeting again, and the game already enforces that where it belongs — others()
-- excludes restricted pairs bidirectionally, so a blocked person never becomes a
-- candidate. It is not repeated here, because a live relation is what this asks
-- about and a blocked pair has none: every branch below is a row that a block
-- would have already torn down. Adding it would look like defence in depth and
-- would in fact be a second copy of a rule that can drift from the first.
create or replace function public.can_view_photos(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    -- MYSELF. The editor, the preview, the roster row that is me.
    p_viewer = p_owner

    -- THE GAME. A watch row in either direction is what puts a face on home:
    -- the candidate I am watching, the person who invited me, my chat partner.
    -- 'ended' counts while the card is still on the screen — a conversation that
    -- is over is drawn until its owner clears it away, and each side clears its
    -- own (watcher_cleared_at / target_cleared_at).
    or exists (
      select 1 from public.watch w
       where (
              (w.watcher_id = p_viewer and w.target_id  = p_owner and (w.state <> 'ended' or w.watcher_cleared_at is null))
           or (w.target_id  = p_viewer and w.watcher_id = p_owner and (w.state <> 'ended' or w.target_cleared_at  is null))
       )
    )

    -- FRIENDS, and the asking that precedes them. A pending request draws both
    -- cards: the requester found them, the target has to look at who is asking.
    or exists (
      select 1 from public.friend_links f
       where (f.a = p_viewer and f.b = p_owner) or (f.b = p_viewer and f.a = p_owner)
    )
    or exists (
      select 1 from public.friend_requests fr
       where fr.status = 'pending'
         and ((fr.requester_id = p_viewer and fr.target_id = p_owner)
           or (fr.target_id = p_viewer and fr.requester_id = p_owner))
    )

    -- A CIRCLE WE ARE BOTH IN. The roster lists every member with their face, and
    -- a row opens that person's page. `hidden` is not consulted: it means "do not
    -- put us in front of each other in the GAME" (see the column's own comment),
    -- and a hidden member is still on the roster.
    or exists (
      select 1
        from public.user_groups mine
        join public.user_groups theirs on theirs.group_id = mine.group_id
       where mine.user_id = p_viewer and theirs.user_id = p_owner
    )

    -- SOMEONE KNOCKING ON A CIRCLE I RUN. An owner or manager answers a join
    -- request by looking at the requester's card.
    or exists (
      select 1
        from public.group_join_requests r
        join public.groups g on g.id = r.group_id
       where r.user_id = p_owner
         and r.status = 'pending'
         and (g.owner_id = p_viewer
              or exists (select 1 from public.group_managers gm
                          where gm.group_id = g.id and gm.user_id = p_viewer))
    )

    -- PUBLIC CIRCLE OWNERS. Not in the plan, found while writing it: every
    -- description of a circle carries the owner's first photo
    -- (_group_owner_json, inside _group_brief_json), and a PUBLIC circle is
    -- returned by search to anybody. So an owner's face is already visible to
    -- every signed-in user, and this branch does not widen anything — it states
    -- what the app does. If that is not wanted, the fix is in _group_owner_json,
    -- where the photo is put on the wire, and this branch should narrow with it.
    or exists (
      select 1 from public.groups g
       where g.owner_id = p_owner
         and (g.is_public
              or exists (select 1 from public.user_groups ug
                          where ug.group_id = g.id and ug.user_id = p_viewer)
              or exists (select 1 from public.group_join_requests r
                          where r.group_id = g.id and r.user_id = p_viewer and r.status = 'pending'))
    );
$$;

revoke all on function public.can_view_photos(uuid, uuid) from public, anon;
-- `authenticated` MAY call it: the storage policy below is evaluated as the
-- caller, so the role reading a photo has to be able to ask the question. It
-- takes both ids explicitly rather than reading auth.uid() itself, which is what
-- makes it testable — but that also means it must never be trusted as an
-- authorization answer on its own. The POLICY pins the viewer to auth.uid();
-- nothing else may call this with a viewer it was handed.
grant execute on function public.can_view_photos(uuid, uuid) to authenticated, service_role;

-- The read side of the `users` bucket, as an ADDITIONAL permissive policy beside
-- the existing own-folder one (`users_select_public`), which stays: policies OR
-- together, so this only ever widens, and the bucket being public means it
-- changes nothing observable today. The path is `<owner>/<variant>/<file>`, so
-- the first segment IS the owner.
create policy "users_select_related" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'users'
    and public.can_view_photos(
      (select auth.uid()),
      nullif((string_to_array(name, '/'))[1], '')::uuid
    )
  );
