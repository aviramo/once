-- ============================================================================
-- Bug reports — let an app user report a bug they hit (free text + one optional
-- image), surfaced as an entity in the web admin exactly like user `reports`.
--
-- public.bug_reports — one row per submission. Plain uuid `reporter_id` with NO
--   FK (mirrors public.reports / public.restrictions) so the record survives
--   account deletion. RLS enabled, NO policies → service-role only (edge
--   function writes via app_bug_report; web admin reads/triages via the
--   service role, which bypasses RLS). Same pattern as reports/areas/groups.
--
-- public.app_bug_report(me_id, p_text, p_attachment_key) — pure insert (does
--   NOT touch relations / credits / any game state, unlike app_report). Returns
--   the standard {user, notify:[]} envelope so the dispatcher persists + the
--   client's applyServerUser keeps state fresh in the same round trip.
--
-- Storage: private bucket `bug-attachments`, key `{user_id}/{uuid}.jpg`,
--   same upload/read policy shape as chat-images (write only to your own
--   folder; read your own folder — the admin panel uses the service role and
--   bypasses RLS, so it reads every attachment).
--
-- BACKWARD COMPAT: purely additive. New table, new RPC, new /app/bug_report
--   endpoint the deployed app never calls, new storage bucket. NOT breaking —
--   no BACKWARD_COMPAT.md entry required.
-- ============================================================================

create table if not exists public.bug_reports (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  reporter_id     uuid not null,
  text            text not null,
  attachment_key  text,                       -- storage key in bug-attachments, nullable
  handled         boolean not null default false,
  handled_at      timestamptz
);

create index if not exists bug_reports_unhandled_idx
  on public.bug_reports (created_at desc) where not handled;
create index if not exists bug_reports_reporter_idx
  on public.bug_reports (reporter_id);

alter table public.bug_reports enable row level security;
-- No RLS policies on purpose (identical pattern to reports / areas / groups /
-- restrictions): only the edge function and the web admin touch this, both via
-- the service-role key (which bypasses RLS).

create or replace function public.app_bug_report(
  me_id          uuid,
  p_text         text,
  p_attachment_key text default null
)
returns jsonb
language plpgsql
as $function$
declare
  me_row      public.users;
  result_user json;
begin
  select * into me_row from public.users where user_id = me_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  -- Require some substance: a bug report with neither text nor an attachment
  -- is meaningless. The client disables Send until there is text, but guard
  -- server-side too.
  if coalesce(btrim(p_text), '') = '' and coalesce(p_attachment_key, '') = '' then
    return jsonb_build_object('error', 'empty');
  end if;

  insert into public.bug_reports (reporter_id, text, attachment_key)
  values (me_id, coalesce(btrim(p_text), ''), nullif(p_attachment_key, ''));

  select row_to_json(u) into result_user from public.users u where u.user_id = me_id;
  return jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
end;
$function$;

revoke all on function public.app_bug_report(uuid, text, text)
  from public, anon, authenticated;

-- Private storage bucket for bug attachments (single image per report).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bug-attachments', 'bug-attachments', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Upload: authenticated users may only write to their own {user_id}/ folder.
drop policy if exists bug_attachments_upload on storage.objects;
create policy bug_attachments_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Read: the uploader may read their own folder. The web admin reads via the
-- service role (bypasses RLS), so no admin-specific policy is needed.
drop policy if exists bug_attachments_read on storage.objects;
create policy bug_attachments_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
