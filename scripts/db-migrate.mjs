/**
 * Apply a migration FILE to the live database, and record it as applied.
 *
 * `supabase db push` is not usable here: the local `supabase/migrations/`
 * filenames do not always match the live applied history (see CLAUDE.md), so a
 * push would try to replay everything the remote does not recognise. This runs
 * exactly the one file it is given, through the Management API's
 * `/database/query`, and then writes the version into
 * `supabase_migrations.schema_migrations` itself so the two sides stay in step.
 *
 * The access token is the Supabase CLI's own, which lives in the Windows
 * Credential Manager under `Supabase CLI:supabase` — reading it from there
 * means the token is written down in exactly one place on the machine and
 * never in this repo. `SUPABASE_ACCESS_TOKEN` in the environment wins if set.
 *
 *   node scripts/db-migrate.mjs supabase/migrations/2026..._name.sql
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { loadRootEnv } from "./env.mjs";

loadRootEnv();

const PROJECT_REF = (process.env.SUPABASE_URL ?? "").match(
  /https:\/\/([a-z0-9]+)\.supabase\.co/,
)?.[1];
if (!PROJECT_REF) throw new Error("SUPABASE_URL is missing from /.env");

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  // PowerShell reaches the credential vault; the blob comes back as bytes, and
  // the CLI stores plain ASCII in it.
  const ps = `
$sig = @"
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
"@
Add-Type -MemberDefinition $sig -Namespace CredMan -Name Native
$ptr = [IntPtr]::Zero
if (-not [CredMan.Native]::CredRead("Supabase CLI:supabase", 1, 0, [ref]$ptr)) { exit 1 }
# CREDENTIAL, x64: Flags 0, Type 4, TargetName* 8, Comment* 16,
# LastWritten 24 (FILETIME, 8 bytes), CredentialBlobSize 32, CredentialBlob* 40.
$size = [Runtime.InteropServices.Marshal]::ReadInt32($ptr, 32)
$blob = [Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, 40)
$bytes = New-Object byte[] $size
[Runtime.InteropServices.Marshal]::Copy($blob, $bytes, 0, $size)
[Text.Encoding]::ASCII.GetString($bytes)
`;
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { encoding: "utf8" },
  ).trim();
}

async function query(sql, token) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body;
}

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/db-migrate.mjs <migration.sql>");

const sql = readFileSync(file, "utf8");
// The version is the timestamp prefix and the name is the rest — the shape the
// CLI writes, so a later `supabase migration list` reads this as its own.
const stem = basename(file, ".sql");
const version = stem.slice(0, 14);
const name = stem.slice(15);

const token = accessToken();
await query(sql, token);
await query(
  `insert into supabase_migrations.schema_migrations (version, name)
   values ('${version}', '${name.replace(/'/g, "''")}')
   on conflict (version) do nothing`,
  token,
);
console.log(`applied ${version} ${name}`);
