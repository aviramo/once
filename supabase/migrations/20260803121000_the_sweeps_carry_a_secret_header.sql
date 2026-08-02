-- THE SWEEPS CARRY A SECRET, AND IT IS NOT WRITTEN DOWN ANYWHERE.
--
-- All four cron jobs presented the ANON key to /ext, and the ext function
-- compared the header against it. That key is not a secret: it ships inside the
-- mobile bundle, and until this migration it was sitting in plain text in
-- 20260731120000_archive_purge_cron.sql and in three other job bodies, i.e. in
-- git and in `cron.job`. Anyone holding it could run the sweeps at will —
-- /ext/cron and /ext/resync for the DB load and the push waves they fan out,
-- /ext/purge to drop log rows, and /ext/archive to purge an account's archive
-- (auth identity included) ahead of its own 30-day clock.
--
-- TWO HEADERS, BECAUSE `Authorization` IS NOT OURS TO SPEND. The platform
-- gateway verifies that header as a JWT and answers 401 before the request
-- reaches the function at all — which is precisely what the anon key was
-- quietly doing for these jobs — so a random secret in it is refused upstream
-- (measured against the live endpoint before this was written). Authorization
-- therefore keeps carrying the anon key, as a public key doing a public key's
-- job, and `x-ext-secret` carries the credential that actually authorizes the
-- sweep. The ext function checks the second and ignores the first.
--
-- BOTH VALUES COME OUT OF THE VAULT AT FIRE TIME, so neither is in this file
-- nor in the job body — the whole reason the header is composed with
-- jsonb_build_object instead of being the literal it used to be. `ext_secret`
-- matches the ext function's EXT_SECRET env var; rotating means writing both,
-- in either order (a mismatched pair fails closed, and these are sweeps: the
-- next tick recovers). `ext_anon_key` is public and is in the vault only so
-- that nothing about this job body has to be edited when it rotates.
--
-- MIGRATE step of Expand → Migrate → Contract. Expand was the ext function
-- learning the new header (supabase/functions/ext/index.ts), which falls back
-- to the old anon-in-Authorization check while EXT_SECRET is unset and so is
-- safe to deploy in either order relative to this. Contract is the
-- BACKWARD_COMPAT.md entry: drop that fallback once these four jobs are
-- confirmed running on the header.
do $$
declare
  j record;
  target text;
begin
  for j in
    select jobid, jobname, schedule, command from cron.job
     where command like '%/functions/v1/ext/%'
  loop
    target := substring(j.command from 'https://[^'']*/functions/v1/ext/[a-z]+');
    perform cron.schedule(
      j.jobname,
      j.schedule,
      format(
        $q$SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ext_anon_key'),
      'x-ext-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ext_secret')
    ),
    body := '{}'::jsonb
  )$q$, target)
    );
  end loop;
end $$;
