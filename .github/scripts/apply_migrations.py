#!/usr/bin/env python3
"""Apply the named migration files to the live Supabase database, once each.

Called by .github/workflows/db-migrate.yml with the files a push added. It
talks to the Management API's query endpoint, which is the only door to DDL
that a credential (rather than a network route into the VPC) can open.

Two things make it safe to run on a production database:

  * A FILE IS APPLIED ONCE. Every applied version is recorded in
    `supabase_migrations.schema_migrations` - the CLI's own ledger - and a file
    whose version is already there is skipped with a note. Re-running the
    workflow, or pushing a commit that touches an old file, does nothing.

  * A FILE IS ONE STATEMENT TO POSTGRES. The whole file is sent as a single
    query, so the simple-query protocol wraps it in one implicit transaction:
    it lands whole or not at all. A migration that manages its own transaction
    with explicit BEGIN/COMMIT still behaves exactly as written.

The version is the leading digits of the filename, which is the convention the
CLI uses and the whole of `supabase/migrations/` already follows.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

REF = os.environ["PROJECT_REF"]
TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"

VERSION_RE = re.compile(r"^(\d+)")


def query(sql: str):
    """One round trip to the database. Any non-2xx is fatal: a migration that
    half-applied must stop the run rather than be recorded as done."""
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            # Named on purpose. urllib's default ("Python-urllib/3.x") is
            # refused by the edge in front of the Management API before the
            # request reaches Supabase at all - a Cloudflare 403, error code
            # 1010, which reads like a rejected token and is not one.
            "User-Agent": "once-db-migrate/1.0 (+https://github.com/aviramo/once)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode()
            return json.loads(body) if body else []
    except urllib.error.HTTPError as err:
        detail = err.read().decode()
        print(f"::error::database refused the statement ({err.code}): {detail}")
        raise SystemExit(1)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main(paths: list[str]) -> int:
    files = [p for p in paths if p.endswith(".sql")]
    if not files:
        print("nothing to apply")
        return 0

    # The ledger may not exist at all on a project that has only ever been
    # migrated by hand, which is this one. Created with the CLI's own shape so
    # that a future `supabase db push` reads it rather than starting over.
    query(
        "create schema if not exists supabase_migrations;"
        "create table if not exists supabase_migrations.schema_migrations ("
        "  version text primary key, statements text[], name text);"
    )
    applied = {
        row["version"]
        for row in query("select version from supabase_migrations.schema_migrations;")
    }

    for path in files:
        name = os.path.basename(path)
        match = VERSION_RE.match(name)
        if not match:
            print(f"::error::{name} does not start with a version stamp")
            return 1
        version = match.group(1)

        if version in applied:
            print(f"skip  {name} (already recorded as applied)")
            continue

        with open(path, encoding="utf-8") as handle:
            sql = handle.read()
        if not sql.strip():
            print(f"skip  {name} (empty)")
            continue

        print(f"apply {name}")
        query(sql)
        query(
            "insert into supabase_migrations.schema_migrations (version, name)"
            f" values ({sql_literal(version)}, {sql_literal(name)})"
            " on conflict (version) do nothing;"
        )
        print(f"done  {name}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
