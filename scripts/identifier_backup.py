"""Encrypted, read-only application DB + Storage backup for the identifier cutover.

Capture requires the database write pause. Nothing in this program applies SQL,
changes cron jobs, deletes objects, or resets community/XP data.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx
from cryptography.fernet import Fernet
from dotenv import dotenv_values

PROJECT = "qnrtryspglioqhdxglzu"


def canonical(value) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()


def capture(project: str, directory: Path, key_path: Path, token: str):
    with httpx.Client(
        base_url="https://api.supabase.com",
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
    ) as api:

        def query(sql):
            r = api.post(
                f"/v1/projects/{project}/database/query",
                json={"query": "begin read only; " + sql + "; commit;"},
            )
            r.raise_for_status()
            return r.json()

        state = query("select public.identifier_schema_state() as state")[0]["state"]
        if not state["maintenance"] or state["version"] != 1:
            raise ValueError("capture requires the pre-cutover global write pause")
        directory.mkdir(parents=True, mode=0o700, exist_ok=False)
        os.chmod(directory, 0o700)
        key_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        key = Fernet.generate_key()
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(key)
        cipher = Fernet(key)
        archive = directory / "application-db.jsonl.fernet"
        manifest = {
            "project": project,
            "captured_at": datetime.now(UTC).isoformat(),
            "version": 1,
            "tables": {},
            "objects": [],
            "key_path": str(key_path),
        }
        meta = query("""select jsonb_build_object(
         'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public'),
         'constraints',(select jsonb_agg(jsonb_build_object('table',t.relname,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'),
         'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
         'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname='public'),
         'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'),
         'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema='public'),
         'table_security',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
         'sequences',(select jsonb_agg(to_jsonb(s)) from pg_sequences s where schemaname='public'),
         'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
         'auth_user_ids',(select coalesce(jsonb_agg(id),'[]') from auth.users),
         'migration_history',(select jsonb_agg(to_jsonb(m)) from supabase_migrations.schema_migrations m),
         'storage_objects',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from storage.objects o),
         'storage_buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from storage.buckets b),
         'cron_jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from cron.job j)
        ) as metadata""")[0]["metadata"]
        keys = query("""select t.relname as table_name,array_agg(a.attname order by k.n) as columns
        from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace
        cross join lateral unnest(c.conkey) with ordinality k(attnum,n)
        join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum
        where ns.nspname='public' and c.contype='p' group by t.relname order by t.relname""")
        if len(keys) != 44:
            raise ValueError("unreviewed table inventory")
        with archive.open("xb") as out:
            os.chmod(archive, 0o600)

            def record(value):
                out.write(cipher.encrypt(gzip.compress(canonical(value))) + b"\n")

            record({"kind": "metadata", "data": meta})
            for item in keys:
                table, columns = item["table_name"], item["columns"]

                # Names originate from the catalog; quote them as SQL identifiers.
                def ident(v):
                    return '"' + v.replace('"', '""') + '"'

                order = ",".join(ident(c) for c in columns)
                total, offset, digest = 0, 0, hashlib.sha256()
                while True:
                    rows = query(
                        f"select to_jsonb(t) as row from public.{ident(table)} t order by {order} limit 5000 offset {offset}"
                    )
                    data = [r["row"] for r in rows]
                    if not data:
                        break
                    for row in data:
                        digest.update(canonical(row) + b"\n")
                    record({"kind": "rows", "table": table, "rows": data})
                    total += len(data)
                    offset += len(data)
                    if len(data) < 5000:
                        break
                manifest["tables"][table] = {
                    "rows": total,
                    "sha256": digest.hexdigest(),
                    "pk": columns,
                }
                print(json.dumps({"backed_up": table, "rows": total}), flush=True)
        # Download object bodies using a server-only key, never persisting/logging it.
        r = api.get(f"/v1/projects/{project}/api-keys")
        r.raise_for_status()
        service = next(k["api_key"] for k in r.json() if k["name"] == "service_role")
        with httpx.Client(
            headers={"Authorization": f"Bearer {service}", "apikey": service},
            timeout=90,
        ) as storage:
            for obj in meta["storage_objects"]:
                path = f"{obj['bucket_id']}/{obj['name']}"
                response = storage.get(
                    f"https://{project}.supabase.co/storage/v1/object/authenticated/{quote(path, safe='/')}"
                )
                if response.status_code != 200:
                    raise RuntimeError("private_object_backup_failed")
                content = response.content
                filename = hashlib.sha256(path.encode()).hexdigest() + ".object.fernet"
                target = directory / filename
                target.write_bytes(cipher.encrypt(content))
                os.chmod(target, 0o600)
                manifest["objects"].append(
                    {
                        "file": filename,
                        "sha256": hashlib.sha256(content).hexdigest(),
                        "bytes": len(content),
                    }
                )
        final = query("select public.identifier_schema_state() as state")[0]["state"]
        if final != state:
            raise ValueError("write pause changed during capture")
        manifest["archive_sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        manifest["complete"] = True
        target = directory / "manifest.json"
        target.write_bytes(canonical(manifest))
        os.chmod(target, 0o600)
        print(
            json.dumps(
                {
                    "complete": True,
                    "directory": str(directory),
                    "tables": len(keys),
                    "objects": len(manifest["objects"]),
                }
            ),
            flush=True,
        )


def unpack(directory: Path, destination: Path):
    """Decrypt locally for a private restore rehearsal, never into the repository."""
    manifest = json.loads((directory / "manifest.json").read_bytes())
    archive = directory / "application-db.jsonl.fernet"
    if (
        not manifest.get("complete")
        or hashlib.sha256(archive.read_bytes()).hexdigest()
        != manifest["archive_sha256"]
    ):
        raise ValueError("incomplete or corrupt backup")
    cipher = Fernet(Path(manifest["key_path"]).read_bytes())
    destination.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(destination, 0o700)
    handles = {}
    try:
        with archive.open("rb") as source:
            for line in source:
                record = json.loads(gzip.decompress(cipher.decrypt(line.strip())))
                if record["kind"] == "metadata":
                    p = destination / "metadata.json"
                    p.write_bytes(canonical(record["data"]))
                    os.chmod(p, 0o600)
                else:
                    table = record["table"]
                    if table not in manifest["tables"]:
                        raise ValueError("unknown backup table")
                    if table not in handles:
                        handles[table] = (destination / (table + ".jsonl")).open("xb")
                        os.chmod(destination / (table + ".jsonl"), 0o600)
                    for row in record["rows"]:
                        handles[table].write(canonical(row) + b"\n")
    finally:
        for out in handles.values():
            out.close()
    for table, expected in manifest["tables"].items():
        p = destination / (table + ".jsonl")
        if not p.exists():
            p.touch(mode=0o600)
        if hashlib.sha256(p.read_bytes()).hexdigest() != expected["sha256"]:
            raise ValueError("restore data checksum mismatch: " + table)
    checked_images = 0
    for obj in manifest["objects"]:
        data = cipher.decrypt((directory / obj["file"]).read_bytes())
        if (
            hashlib.sha256(data).hexdigest() != obj["sha256"]
            or len(data) != obj["bytes"]
        ):
            raise ValueError("object checksum mismatch")
        if checked_images < 3 and (
            data.startswith(b"\xff\xd8") or data.startswith(b"\x89PNG")
        ):
            from io import BytesIO

            from PIL import Image

            with Image.open(BytesIO(data)) as image:
                image.verify()
            checked_images += 1
    (destination / "manifest.json").write_bytes(canonical(manifest))
    os.chmod(destination / "manifest.json", 0o600)
    print(
        json.dumps(
            {
                "verified_tables": len(manifest["tables"]),
                "verified_objects": len(manifest["objects"]),
                "verified_sample_images": checked_images,
                "private_restore_directory": str(destination),
            }
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("--project-ref", default=PROJECT)
    cap.add_argument("--directory", type=Path, required=True)
    cap.add_argument("--key-path", type=Path, required=True)
    un = sub.add_parser("unpack")
    un.add_argument("directory", type=Path)
    un.add_argument("destination", type=Path)
    args = parser.parse_args()
    if args.command == "unpack":
        unpack(args.directory, args.destination)
    else:
        token = os.environ.get("SUPABASE_ACCESS_TOKEN") or dotenv_values(
            ".env.deploy.local"
        ).get("SUPABASE_ACCESS_TOKEN")
        if not token:
            parser.error("SUPABASE_ACCESS_TOKEN is required")
        capture(args.project_ref, args.directory, args.key_path, token)


if __name__ == "__main__":
    main()
