"""Import the rehearsed small seed into an EMPTY replacement project only.

Never resets or deletes data. Uses bounded transactions and verifies every batch.
Secrets and row contents are never printed. The old project is forbidden.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import httpx
from dotenv import dotenv_values

OLD_PROJECT = "qnrtryspglioqhdxglzu"


def ident(value: str) -> str:
    if not re.fullmatch(r"[a-z_][a-z_0-9]*", value):
        raise ValueError("invalid SQL identifier")
    return '"' + value + '"'


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("seed", type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--apply-schema", action="store_true")
    parser.add_argument("--finalize-only", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z]{20}", args.project) or args.project == OLD_PROJECT:
        raise ValueError("replacement project required")
    root = args.seed.resolve()
    repo = Path.cwd().resolve()
    if root.is_relative_to(repo):
        raise ValueError("seed must be private and outside Git")
    manifest = json.loads((root / "manifest.json").read_text())
    if not manifest.get("reset_user_data") or not manifest.get(
        "new_record_smoke_passed"
    ):
        raise ValueError("rehearsed fresh-user seed required")
    schema = (root / "schema.sql").read_text()
    if hashlib.sha256(schema.encode()).hexdigest() != manifest["bootstrap_sha256"]:
        raise ValueError("schema checksum mismatch")
    if (
        hashlib.sha256((root / "sequences.sql").read_bytes()).hexdigest()
        != manifest["sequences_sha256"]
    ):
        raise ValueError("sequence checksum mismatch")
    for table, details in manifest["tables"].items():
        ident(table)
        if (
            hashlib.sha256((root / f"{table}.jsonl").read_bytes()).hexdigest()
            != details["sha256"]
        ):
            raise ValueError(f"seed checksum mismatch: {table}")
    secrets = dotenv_values(".env.deploy.local")
    base = f"https://api.supabase.com/v1/projects/{args.project}"
    with httpx.Client(
        headers={"Authorization": "Bearer " + secrets["SUPABASE_ACCESS_TOKEN"]},
        timeout=105,
    ) as client:

        def query(sql: str):
            result = client.post(base + "/database/query", json={"query": sql})
            if not result.is_success:
                # Errors may echo SQL and private rows: retain only the status.
                error_file = root / "last-api-error.txt"
                error_file.write_text(result.text)
                error_file.chmod(0o600)
                raise RuntimeError(
                    f"SQL failed HTTP {result.status_code}; private error saved"
                )
            return result.json()

        def headroom():
            data = query(
                "select pg_database_size(current_database()) db_bytes, coalesce((select sum(size) from pg_ls_waldir()),0) wal_bytes;"
            )[0]
            print(json.dumps({"capacity": data}), flush=True)
            if (
                int(data["db_bytes"]) > 200 * 1024**2
                or int(data["wal_bytes"]) > 320 * 1024**2
            ):
                raise RuntimeError(
                    "headroom threshold reached; stopped, no automatic retries"
                )
            return data

        project = client.get(base)
        project.raise_for_status()
        if project.json().get("name") != "ClearPath_Final":
            raise ValueError("unexpected project name")
        headroom()
        if args.apply_schema:
            query(schema)
            print("Fresh numeric schema installed in maintenance mode", flush=True)
        state = query("select identifier_schema_state() state;")[0]["state"]
        if state != {"version": 2, "maintenance": True}:
            raise ValueError("numeric schema with maintenance required")
        meta = query(
            "select table_name,column_name,is_generated,is_identity from information_schema.columns where table_schema='public' order by table_name,ordinal_position;"
        )
        primary = query(
            "select t.relname table_name,array_agg(a.attname::text order by k.ordinality) columns from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum where n.nspname='public' and c.contype='p' group by t.relname;"
        )
        pk = {r["table_name"]: r["columns"] for r in primary}
        digests = (
            json.loads((root / "verification-digests.json").read_text())
            if args.finalize_only
            else {}
        )
        for table, details in manifest["tables"].items():
            if args.finalize_only:
                actual = query(
                    f"select count(*) n,md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(to_jsonb(t)::text) h from public.{ident(table)} t) rows;"
                )[0]
                if actual != digests[table] or actual["n"] != details["rows"]:
                    raise ValueError(f"final fingerprint mismatch: {table}")
                print(
                    json.dumps({"fingerprint_verified": table, "rows": actual["n"]}),
                    flush=True,
                )
                continue
            cols = [
                c["column_name"]
                for c in meta
                if c["table_name"] == table and c["is_generated"] != "ALWAYS"
            ]
            col_sql = ",".join(map(ident, cols))
            batch = []
            done = 0

            def flush(table=table, col_sql=col_sql):
                nonlocal done, batch
                if not batch:
                    return
                data = json.dumps(batch, separators=(",", ":"), ensure_ascii=False)
                rows = f"jsonb_populate_recordset(null::public.{ident(table)},{literal(data)}::jsonb)"
                match = " and ".join(f"t.{ident(c)}=s.{ident(c)}" for c in pk[table])
                sql = f"""begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local clearpath.identifier_migration='approved';
insert into public.{ident(table)}({col_sql}) overriding system value
select {col_sql} from {rows}
on conflict({",".join(map(ident, pk[table]))}) do nothing;
do $verify$ begin
 if exists(select 1 from {rows} s left join public.{ident(table)} t on {match}
 where to_jsonb(t) is distinct from to_jsonb(s)) then
 raise exception 'seed_value_mismatch:{table}'; end if;
end $verify$;
commit;"""
                query(sql)
                done += len(batch)
                batch = []

            for line in (root / f"{table}.jsonl").open():
                batch.append(json.loads(line))
                if len(batch) >= 200:
                    flush()
                    if done % 2000 == 0:
                        headroom()
            flush()
            actual = query(f"select count(*) n from public.{ident(table)};")[0]["n"]
            if actual != details["rows"]:
                raise ValueError(f"row count mismatch: {table}")
            print(json.dumps({"verified": table, "rows": done}), flush=True)
        # Sequence changes are separate from transactional row inserts. Safe to
        # repeat only while global maintenance prevents concurrent allocations.
        query("begin;" + (root / "sequences.sql").read_text() + "commit;")
        counts = query(
            "select (select count(*) from auth.users) auth_users,(select count(*) from profiles) profiles,(select count(*) from community_reports) community_reports;"
        )[0]
        if any(counts.values()):
            raise ValueError("fresh user state violated")
        capacity = headroom()
        report = {
            "project": args.project,
            "verified_tables": manifest["tables"],
            "fresh_user_counts": counts,
            "capacity": capacity,
            "maintenance": True,
        }
        (root / "import-verification.json").write_text(json.dumps(report, indent=2))
        (root / "import-verification.json").chmod(0o600)
        print("Import verified; maintenance remains ON; website has not been switched")


if __name__ == "__main__":
    main()
