-- ─── Account deletion: a 30-day archive, and a block that outlives the account ───
--
-- Until now app/delete removed the public.users row and nothing else. Everything
-- personal that does not hang off that row by an FK simply stayed: the profile
-- photos (in the PUBLIC `users` bucket, still reachable by URL), the chat rows
-- and chat_reads (their FK is to auth.users, which the delete never touched),
-- every restriction, and the log's user snapshots. The dialog meanwhile promised
-- "כל המידע, התמונות והשיחות יימחקו לצמיתות".
--
-- The shape now (user directive 2026-07-31):
--   * everything personal moves to the `archive` schema and a PRIVATE bucket at
--     the moment of deletion, so the public URL dies immediately and the app
--     sees nothing of him from that second on;
--   * 30 days later the archive is purged AND the auth identity goes with it,
--     which is what makes the deletion real rather than a hidden account;
--   * the one thing that does NOT go is somebody else's BLOCK on him. A user
--     who blocked or reported someone must not meet them again just because
--     they deleted and re-registered. His OWN blocks are his and go with him.
--
-- That last rule is why blocked_identities exists. A block is a pair of user_ids,
-- and a user_id is the auth uid — which today survives a delete (the same Google
-- or Apple account signs back in on the same uid, so the block still bites), but
-- from now on it does not: after 30 days the identity itself is deleted, and a
-- returning user is a NEW uid the old row cannot name. So at purge time each
-- surviving block is re-keyed from "uid" to "whoever holds this identity", and
-- an INSERT into public.users re-materialises it against the new uid. The
-- identity is stored as an HMAC of the provider subject under a server-side
-- pepper: a provider subject is short and enumerable, so a bare digest would be
-- a phone-book, and the pepper is what stops the archive from being one.
--
-- Not breaking for the published client: app/delete keeps its request and
-- response shape, and nothing here is a field the app reads. No BACKWARD_COMPAT
-- entry.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;
grant usage on schema archive to service_role;

-- One place says how long the archive keeps anything, exactly as _log_ttl()
-- does for the log — which is also 30 days, so the two windows agree.
create or replace function public._archive_ttl()
returns interval language sql immutable set search_path to '' as $$
  select interval '30 days'
$$;

-- ── The archive ─────────────────────────────────────────────────────────────
-- archived_for / archived_at go LAST in every table so the copy can stay a
-- plain `select t.*, me_id, now()` and never name a column.

create table if not exists archive.accounts (
  user_id     uuid primary key,
  deleted_at  timestamptz not null default now(),
  -- Set when the purge has run everything it can do in SQL. The row survives as
  -- a tombstone until the auth identity is actually gone, so a failed auth
  -- delete is simply retried on the next tick instead of being lost.
  purged_at   timestamptz,
  snapshot    jsonb,                                -- the whole public.users row
  images      jsonb not null default '[]'::jsonb,   -- keys, now in `users-archive`
  chat_keys   jsonb not null default '[]'::jsonb,   -- [{bucket, key}] chat media
  identities  jsonb not null default '[]'::jsonb    -- hashed, captured while auth still has them
);

create table if not exists archive.chat (
  like public.chat,
  archived_for uuid not null,
  archived_at  timestamptz not null default now()
);
create index if not exists archive_chat_for_idx on archive.chat (archived_for);

create table if not exists archive.chat_reads (
  like public.chat_reads,
  archived_for uuid not null,
  archived_at  timestamptz not null default now()
);
create index if not exists archive_chat_reads_for_idx on archive.chat_reads (archived_for);

create table if not exists archive.restrictions (
  like public.restrictions,
  archived_for uuid not null,
  archived_at  timestamptz not null default now()
);
create index if not exists archive_restrictions_for_idx on archive.restrictions (archived_for);

alter table archive.accounts     enable row level security;
alter table archive.chat         enable row level security;
alter table archive.chat_reads   enable row level security;
alter table archive.restrictions enable row level security;

-- ── The identity a block is re-keyed to ─────────────────────────────────────

create table if not exists public.blocked_identities (
  blocker_id    uuid not null references auth.users(id) on delete cascade,
  identity_hash text not null,
  created_at    timestamptz not null default now(),
  primary key (blocker_id, identity_hash)
);
alter table public.blocked_identities enable row level security;
create index if not exists blocked_identities_hash_idx on public.blocked_identities (identity_hash);

-- The pepper. Created once, never rotated: rotating it would orphan every hash
-- already written and quietly drop the blocks they stand for.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'identity_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'identity_pepper',
      'HMAC pepper for archive.accounts.identities / public.blocked_identities'
    );
  end if;
end $$;

-- Every stable handle on a person, hashed. The provider subject is the real
-- identity (a Google or Apple sub never changes, while an email can), and the
-- email is carried too so the review account's email-OTP login matches as well.
create or replace function public._identity_hashes(uid uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_pepper text;
  v_hashes jsonb;
begin
  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'identity_pepper';
  if v_pepper is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(distinct h), '[]'::jsonb) into v_hashes from (
    select encode(extensions.hmac(i.provider || ':' || i.provider_id, v_pepper, 'sha256'), 'hex') as h
      from auth.identities i
     where i.user_id = uid
    union all
    select encode(extensions.hmac('email:' || lower(u.email), v_pepper, 'sha256'), 'hex')
      from auth.users u
     where u.id = uid and coalesce(u.email, '') <> ''
  ) s;

  return v_hashes;
end $$;

-- ── Deletion: move everything personal into the archive ─────────────────────
-- Runs AFTER app_delete_cleanup (which settles what other users are holding)
-- and BEFORE the users row is deleted, since it copies that row. Returns the
-- photo keys, because moving them between buckets is the one part of this that
-- SQL cannot do — the edge function does it under waitUntil.
create or replace function public.app_archive_user(me_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  me_row   public.users;
  v_images jsonb;
  v_keys   jsonb;
begin
  select * into me_row from public.users where user_id = me_id;
  if not found then return jsonb_build_object('images', '[]'::jsonb); end if;

  -- Profile photos: bucket `users`, key <user_id>/normal/<file>.
  select coalesce(jsonb_agg(me_id::text || '/normal/' || (img->>'normal')), '[]'::jsonb)
    into v_images
    from jsonb_array_elements(coalesce(me_row.data->'images', '[]'::jsonb)) img
   where img->>'normal' is not null;

  -- Chat media. Both buckets are already private, so nothing has to move: the
  -- keys are recorded here and the objects go at purge with the rows.
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys from (
    select jsonb_build_object('bucket', 'chat-images', 'key', c.image_key) k
      from public.chat c
     where c.image_key is not null and (c.user_id = me_id or c.other_id = me_id)
    union all
    select jsonb_build_object('bucket', 'chat-audio', 'key', c.audio_key)
      from public.chat c
     where c.audio_key is not null and (c.user_id = me_id or c.other_id = me_id)
  ) s;

  insert into archive.accounts (user_id, snapshot, images, chat_keys, identities)
  values (me_id, to_jsonb(me_row), v_images, v_keys, public._identity_hashes(me_id))
  on conflict (user_id) do update
    set deleted_at = now(), purged_at = null,
        snapshot   = excluded.snapshot,
        images     = excluded.images,
        chat_keys  = excluded.chat_keys,
        identities = excluded.identities;

  insert into archive.chat select c.*, me_id, now()
    from public.chat c where c.user_id = me_id or c.other_id = me_id;
  delete from public.chat where user_id = me_id or other_id = me_id;

  insert into archive.chat_reads select r.*, me_id, now()
    from public.chat_reads r where r.reader_id = me_id or r.peer_id = me_id;
  delete from public.chat_reads where reader_id = me_id or peer_id = me_id;

  -- Everything he DID (his own blocks included, user directive 2026-07-31) and
  -- every cooldown standing against him. What stays live is the one restriction
  -- that is not his to take away: somebody else's block on him.
  insert into archive.restrictions select r.*, me_id, now()
    from public.restrictions r
   where r.user_id = me_id or (r.other_id = me_id and r.key <> 'block');
  delete from public.restrictions r
   where r.user_id = me_id or (r.other_id = me_id and r.key <> 'block');

  return jsonb_build_object('images', v_images);
end $$;

-- ── A returning user walks back into the blocks he left behind ──────────────
create or replace function public._users_restore_blocks()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_hashes jsonb;
begin
  v_hashes := public._identity_hashes(new.user_id);
  if jsonb_array_length(v_hashes) = 0 then return null; end if;

  -- DISTINCT because an identity is stored under every handle it has (the
  -- provider subject AND the email), so one blocker matches on more than one
  -- hash — and restrictions has no unique key to fall back on, nor can the
  -- NOT EXISTS below see rows this same statement is inserting.
  insert into public.restrictions (user_id, other_id, key)
  select distinct b.blocker_id, new.user_id, 'block'
    from public.blocked_identities b
   where b.identity_hash in (select jsonb_array_elements_text(v_hashes))
     and exists (select 1 from public.users u where u.user_id = b.blocker_id)
     and not exists (
       select 1 from public.restrictions r
        where r.user_id = b.blocker_id and r.other_id = new.user_id and r.key = 'block');

  return null;
end $$;

drop trigger if exists users_restore_blocks on public.users;
create trigger users_restore_blocks after insert on public.users
for each row execute function public._users_restore_blocks();

-- ── The 30-day purge ────────────────────────────────────────────────────────
-- Two calls, because the purge has three external steps SQL cannot take (the
-- storage objects and the auth row). app_archive_due only reads; the edge
-- function clears storage, calls app_archive_finish, then deletes the identity.
create or replace function public.app_archive_due(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_rows jsonb;
begin
  -- A tombstone whose identity is already gone has nothing left to do.
  delete from archive.accounts a
   where a.purged_at is not null
     and not exists (select 1 from auth.users u where u.id = a.user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',   a.user_id,
           'images',    a.images,
           'chat_keys', a.chat_keys)), '[]'::jsonb)
    into v_rows
    from (select * from archive.accounts
           where deleted_at < now() - public._archive_ttl()
           order by deleted_at
           limit greatest(1, least(coalesce(p_limit, 20), 200))) a;

  return jsonb_build_object('rows', v_rows);
end $$;

create or replace function public.app_archive_finish(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_identities jsonb;
  v_blocks     int := 0;
begin
  select identities into v_identities from archive.accounts where user_id = p_user_id;
  if v_identities is null then v_identities := '[]'::jsonb; end if;

  -- Re-key every surviving block from the uid that is about to stop existing to
  -- the identity behind it, then drop the rows that named the uid.
  insert into public.blocked_identities (blocker_id, identity_hash)
  select r.user_id, h
    from public.restrictions r
   cross join lateral jsonb_array_elements_text(v_identities) h
   where r.other_id = p_user_id and r.key = 'block'
     and exists (select 1 from auth.users u where u.id = r.user_id)
  on conflict do nothing;
  get diagnostics v_blocks = row_count;

  delete from public.restrictions where other_id = p_user_id;

  -- log.user_id and states.* are FK NO ACTION against auth.users, so they would
  -- refuse the identity delete. The log row also carries a user snapshot, which
  -- is exactly the kind of thing this purge exists to remove.
  delete from public.log    where user_id  = p_user_id;
  delete from public.states where user_id  = p_user_id or other_id = p_user_id;

  delete from archive.chat         where archived_for = p_user_id;
  delete from archive.chat_reads   where archived_for = p_user_id;
  delete from archive.restrictions where archived_for = p_user_id;

  update archive.accounts
     set purged_at = now(), snapshot = null, images = '[]'::jsonb, chat_keys = '[]'::jsonb
   where user_id = p_user_id;

  return jsonb_build_object('blocks_kept', v_blocks);
end $$;

-- ── The private bucket the photos move into ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('users-archive', 'users-archive', false)
on conflict (id) do nothing;

-- ── Grants: service_role only, per the project's DEFINER convention ─────────
revoke all on function public._archive_ttl()               from public, anon, authenticated;
revoke all on function public._identity_hashes(uuid)       from public, anon, authenticated;
revoke all on function public._users_restore_blocks()      from public, anon, authenticated;
revoke all on function public.app_archive_user(uuid)       from public, anon, authenticated;
revoke all on function public.app_archive_due(int)         from public, anon, authenticated;
revoke all on function public.app_archive_finish(uuid)     from public, anon, authenticated;

grant execute on function public._archive_ttl()            to service_role;
grant execute on function public._identity_hashes(uuid)    to service_role;
grant execute on function public.app_archive_user(uuid)    to service_role;
grant execute on function public.app_archive_due(int)      to service_role;
grant execute on function public.app_archive_finish(uuid)  to service_role;

grant select, insert, update, delete on public.blocked_identities to service_role;
grant select, insert, update, delete on all tables in schema archive to service_role;
