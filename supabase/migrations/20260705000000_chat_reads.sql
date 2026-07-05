-- Durable per-(reader,peer) chat read receipts.
--
-- Until now the ✓✓ "read" acknowledgment travelled ONLY over ephemeral
-- Supabase Realtime Presence: the reader broadcast their latest-seen partner
-- message timestamp, and the sender could pick it up *only if subscribed to
-- the same presence channel at that exact moment*. Nothing was persisted, so
-- if the two users were never online in the chat simultaneously after the
-- read, the receipt was lost forever and the sender's messages stayed at a
-- single ✓ ("sent") indefinitely — even though the recipient genuinely read
-- them (the app opens straight onto the chat).
--
-- This table is the async backstop. Presence stays the live fast-path; this
-- row survives disconnection. A `chat_reads` row means:
--   reader_id has read peer_id's messages up to last_read_at.
create table if not exists public.chat_reads (
  reader_id    uuid        not null,
  peer_id      uuid        not null,
  last_read_at timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (reader_id, peer_id)
);

comment on table public.chat_reads is
  'Per-(reader,peer) durable read receipt: reader_id has read peer_id''s messages up to last_read_at. Async backstop for the ephemeral presence read-receipt path.';

-- Sender-side lookup "who has read MY messages" -> peer_id = me.
create index if not exists chat_reads_peer_idx on public.chat_reads (peer_id);

-- Clamp last_read_at monotonically forward and stamp updated_at, so an
-- out-of-order upsert (races between presence retrack, foreground poll, and
-- the durable path) can never regress the receipt boundary.
create or replace function public._chat_reads_monotonic()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.last_read_at < old.last_read_at then
    new.last_read_at := old.last_read_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists chat_reads_monotonic on public.chat_reads;
create trigger chat_reads_monotonic
  before insert or update on public.chat_reads
  for each row execute function public._chat_reads_monotonic();

-- RLS. A user may READ rows where they are the reader (their own read state)
-- or the peer (someone read their messages -> drives the sender's ✓✓, and is
-- what Realtime authorizes the sender's subscription against). A user may
-- only WRITE rows asserting their OWN reads (reader_id = auth.uid()).
alter table public.chat_reads enable row level security;

-- Supabase's default privileges grant new public tables to anon/authenticated
-- wholesale; reset and re-grant the minimum (matches the `chat` table, which
-- also revokes anon). anon gets nothing (no policy anyway); authenticated may
-- only select/insert/update, gated further by the policies below.
revoke all on table public.chat_reads from anon;
revoke all on table public.chat_reads from authenticated;
grant select, insert, update on table public.chat_reads to authenticated;

drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (reader_id = auth.uid() or peer_id = auth.uid());

drop policy if exists chat_reads_insert on public.chat_reads;
create policy chat_reads_insert on public.chat_reads
  for insert to authenticated
  with check (reader_id = auth.uid());

drop policy if exists chat_reads_update on public.chat_reads;
create policy chat_reads_update on public.chat_reads
  for update to authenticated
  using (reader_id = auth.uid())
  with check (reader_id = auth.uid());

-- Realtime: the sender receives the partner's read receipt as a
-- postgres_changes INSERT/UPDATE and advances the ✓✓ boundary live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end
$$;
