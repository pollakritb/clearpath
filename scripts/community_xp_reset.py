"""Explicit, resumable community reset; never invoked by migrations or deploy.

Requires separately reviewed approval of the exact project and encrypted backup.
No production command is run by importing or testing this module.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from cryptography.fernet import Fernet

if __package__:
    from .community_reset_sql import ALL_TABLES, TABLES, reset_sql, snapshot_sql
else:
    from community_reset_sql import ALL_TABLES, TABLES, reset_sql, snapshot_sql


def query(project: str, sql: str):
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    response = httpx.post(
        f"https://api.supabase.com/v1/projects/{project}/database/query",
        headers={"Authorization": f"Bearer {token}"},
        json={"query": sql},
        timeout=120,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Database operation failed ({response.status_code}); inspect the project dashboard"
        )
    return response.json()


def objects(project: str) -> list[str]:
    # This bucket is private and exclusively for community evidence; announcements
    # live in the separate announcement-images bucket. Include orphan uploads.
    rows = query(
        project,
        "select coalesce(jsonb_agg(name order by name),'[]') names from storage.objects where bucket_id='report-images'",
    )
    return rows[0]["names"]


def storage(project: str):
    from supabase import create_client

    return create_client(
        f"https://{project}.supabase.co", os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    ).storage.from_("report-images")


def canonical(value) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()


def write_record(stream, cipher: Fernet, record: dict, chain: str, index: int) -> str:
    record = record | {"index": index, "previous": chain}
    raw = canonical(record)
    stream.write(cipher.encrypt(raw) + b"\n")
    return hashlib.sha256(raw).hexdigest()


def records(path: Path, cipher: Fernet):
    previous = ""
    last = None
    with path.open("rb") as stream:
        for index, line in enumerate(stream):
            raw = cipher.decrypt(line.rstrip(b"\n"))
            record = json.loads(raw)
            if record["index"] != index or record["previous"] != previous:
                raise ValueError("backup sequence mismatch")
            previous = hashlib.sha256(raw).hexdigest()
            last = record
            yield record
    if not last or last["type"] != "complete":
        raise ValueError("incomplete backup")


def backup(project: str, path: Path, cipher: Fernet) -> dict:
    snapshot = query(project, snapshot_sql())[0]["snapshot"]
    paths = objects(project)
    manifest = dict(
        project=project,
        created_at=datetime.now(UTC).isoformat(),
        delete_backup_after=(datetime.now(UTC) + timedelta(days=7)).isoformat(),
        fingerprints=snapshot["fingerprints"],
        images=paths,
        version=1,
    )
    manifest["sha256"] = hashlib.sha256(canonical(manifest)).hexdigest()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    chain = ""
    index = 0
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        for record in [
            {"type": "snapshot", "manifest": manifest, "data": snapshot["tables"]}
        ]:
            chain = write_record(stream, cipher, record, chain, index)
            index += 1
        bucket = storage(project)
        for name in paths:
            content = bucket.download(name)
            chain = write_record(
                stream,
                cipher,
                {
                    "type": "image",
                    "name": name,
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "content": base64.b64encode(content).decode(),
                },
                chain,
                index,
            )
            index += 1
        write_record(
            stream,
            cipher,
            {
                "type": "complete",
                "images": len(paths),
                "manifest_sha256": manifest["sha256"],
            },
            chain,
            index,
        )
    verify(path, cipher)
    return manifest


def verify(path: Path, cipher: Fernet) -> dict:
    manifest = None
    names = []
    footer = None
    for record in records(path, cipher):
        if record["type"] == "snapshot":
            manifest = record["manifest"]
            expected = manifest["sha256"]
            if (
                hashlib.sha256(
                    canonical({k: v for k, v in manifest.items() if k != "sha256"})
                ).hexdigest()
                != expected
            ):
                raise ValueError("manifest checksum mismatch")
        elif record["type"] == "image":
            if (
                hashlib.sha256(base64.b64decode(record["content"])).hexdigest()
                != record["sha256"]
            ):
                raise ValueError("image checksum mismatch")
            names.append(record["name"])
        elif record["type"] == "complete":
            footer = record
    if (
        not manifest
        or not footer
        or names != manifest["images"]
        or footer["images"] != len(names)
        or footer["manifest_sha256"] != manifest["sha256"]
    ):
        raise ValueError("backup contents mismatch")
    return manifest


def reset(project: str, path: Path, cipher: Fernet, approval: str, restore_proof: Path):
    manifest = verify(path, cipher)
    expected = f"RESET {project} {manifest['sha256']}"
    if manifest["project"] != project or approval != expected:
        raise ValueError("explicit approval must match the exact project and manifest")
    proof = json.loads(restore_proof.read_text())
    if (
        proof.get("manifest_sha256") != manifest["sha256"]
        or proof.get("target_project") == project
        or proof.get("restored") is not True
    ):
        raise ValueError("a successful staging/local restore proof is required")
    current = query(
        project,
        "select reset_manifest,maintenance from public.community_xp_control limit 1",
    )
    if (
        current
        and current[0].get("reset_manifest") == manifest["sha256"]
        and not current[0]["maintenance"]
    ):
        print(
            json.dumps(
                {
                    "already_completed": True,
                    "project": project,
                    "manifest_sha256": manifest["sha256"],
                }
            )
        )
        return
    # Keep maintenance on after any failure. Operator verifies before reopening.
    query(project, "update public.community_xp_control set maintenance=true")
    query(project, reset_sql(manifest))
    bucket = storage(project)
    for index in range(0, len(manifest["images"]), 50):
        bucket.remove(manifest["images"][index : index + 50])
    remaining = objects(project)
    if remaining:
        raise RuntimeError("storage cleanup incomplete; keep maintenance enabled")
    print(
        json.dumps(
            {
                "reset": True,
                "project": project,
                "maintenance": True,
                "manifest_sha256": manifest["sha256"],
            }
        )
    )


def restore_staging(
    project: str, path: Path, cipher: Fernet, approval: str, proof_path: Path
):
    manifest = verify(path, cipher)
    if (
        project == manifest["project"]
        or approval != f"RESTORE {project} {manifest['sha256']}"
    ):
        raise ValueError("restore must target a separately approved staging project")
    snapshot = next(records(path, cipher))["data"]
    # Never merge a backup into existing community data or an occupied bucket.
    count_sql = (
        "select "
        + "+".join(f"(select count(*) from public.{t})" for t in TABLES)
        + " n"
    )
    if query(project, count_sql)[0]["n"] or objects(project):
        raise ValueError(
            "restore target must have empty community tables and evidence bucket"
        )

    def literal(value):
        return "'" + canonical(value).decode().replace("'", "''") + "'::jsonb"

    columns = query(
        project,
        "select table_name,column_name,data_type,is_generated,is_identity from information_schema.columns where table_schema='public' order by ordinal_position",
    )
    writable = {}
    for column in columns:
        if column["is_generated"] == "NEVER":
            writable.setdefault(column["table_name"], []).append(column["column_name"])
    numeric = (
        next(
            c
            for c in columns
            if c["table_name"] == "profiles" and c["column_name"] == "id"
        )["data_type"]
        == "bigint"
    )
    if snapshot["profiles"] and numeric != isinstance(
        snapshot["profiles"][0]["id"], int
    ):
        raise ValueError(
            "restore requires the same identifier schema version as the backup"
        )
    # A numeric collision must never attach restored data to another Auth user.
    existing = query(
        project,
        "select id,coalesce(to_jsonb(p)->>'auth_user_id',id::text) as auth_user_id from public.profiles p",
    )
    auth_by_id = {str(p["id"]): p["auth_user_id"] for p in existing}
    for profile in snapshot["profiles"]:
        auth_id = str(profile.get("auth_user_id") or profile["id"])
        if (
            str(profile["id"]) in auth_by_id
            and auth_by_id[str(profile["id"])] != auth_id
        ):
            raise ValueError("staging profile identity conflicts with the backup")
    profiles = literal(snapshot["profiles"])
    profile_columns = ["id", "reputation_score", "approved_reports", "helpful_reviews"]
    profile_columns += [
        c for c in ("auth_user_id", "legacy_id") if c in writable["profiles"]
    ]
    pc = ",".join(profile_columns)
    statements = [
        "begin; set local clearpath.community_reset='approved'; set local clearpath.identifier_migration='approved';",
        f"insert into auth.users(id,aud,role,created_at,updated_at) select coalesce(r->>'auth_user_id',r->>'id')::uuid,'authenticated','authenticated',now(),now() from jsonb_array_elements({profiles}) r on conflict(id) do nothing;",
        f"insert into public.profiles({pc}) overriding system value select {pc} from jsonb_populate_recordset(null::public.profiles,{profiles}) on conflict(id) do update set reputation_score=excluded.reputation_score,approved_reports=excluded.approved_reports,helpful_reviews=excluded.helpful_reviews;",
    ]
    order = (
        "capture_sessions",
        "community_reports",
        "reputation_events",
        "report_drafts",
        "report_evidence",
        "report_reviews",
        "report_reactions",
        "report_comments",
        "public_map_events",
        "measurement_requests",
        "measurement_request_recipients",
        "measurement_helper_presence",
        "community_xp_accounts",
        "community_help_claims",
        "community_xp_jobs",
        "community_xp_events",
        "user_notifications",
        "notification_outbox",
        "measurement_delivery_leases",
        "audit_logs",
    )
    for table in order:
        if snapshot[table]:
            cols = ",".join(writable[table])
            statements.append(
                f"insert into public.{table}({cols}) overriding system value select {cols} from jsonb_populate_recordset(null::public.{table},{literal(snapshot[table])});"
            )
    for column in columns:
        table, name = column["table_name"], column["column_name"]
        if column["is_identity"] == "YES" and table in snapshot:
            statements.append(
                f"select setval(pg_get_serial_sequence('public.{table}','{name}'), greatest(coalesce(max({name}),1), coalesce((select last_value from pg_sequences where schemaname='public' and sequencename=split_part(pg_get_serial_sequence('public.{table}','{name}'),'.',2)),1)),true) from public.{table};"
            )
    statements.append("commit;")
    query(project, "\n".join(statements))
    bucket = storage(project)
    for record in records(path, cipher):
        if record["type"] == "image":
            bucket.upload(
                record["name"],
                base64.b64decode(record["content"]),
                {"content-type": "application/octet-stream", "upsert": "false"},
            )
            if (
                hashlib.sha256(bucket.download(record["name"])).hexdigest()
                != record["sha256"]
            ):
                raise ValueError("restored image checksum mismatch")
    restored = query(project, snapshot_sql())[0]["snapshot"]
    # Staging Auth may have created additional unrelated profiles. Compare only
    # restored profile counters, and require all other scoped data to match.
    for table in ALL_TABLES:
        if table == "profiles":
            restored_profiles = {r["id"]: r for r in restored["tables"][table]}
            if any(restored_profiles.get(r["id"]) != r for r in snapshot[table]):
                raise ValueError("restored profile counters mismatch")
        elif restored["fingerprints"][table] != manifest["fingerprints"][table]:
            raise ValueError(f"restored table mismatch: {table}")
    proof = dict(
        manifest_sha256=manifest["sha256"],
        target_project=project,
        restored=True,
        verified_at=datetime.now(UTC).isoformat(),
    )
    with proof_path.open("x") as stream:
        os.chmod(proof_path, 0o600)
        json.dump(proof, stream)
    print(
        "Staging restore verified; keep its private data protected and delete within seven days"
    )


def prune_backups(directory: Path, cipher: Fernet, project: str) -> int:
    """Delete only authenticated, expired archives for this exact project."""
    if not directory.is_dir():
        raise ValueError("--archive must be the backup directory")
    deleted = 0
    now = datetime.now(UTC)
    for path in directory.glob("*.cpxp"):
        if path.is_symlink():
            continue
        manifest = verify(path, cipher)
        expiry = datetime.fromisoformat(manifest["delete_backup_after"])
        if expiry.tzinfo is None:
            raise ValueError("backup expiry requires timezone")
        if manifest["project"] == project and expiry <= now:
            path.unlink()
            deleted += 1
    return deleted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=[
            "key",
            "inventory",
            "backup",
            "verify",
            "reset",
            "restore-staging",
            "prune-backups",
        ],
    )
    parser.add_argument("--project")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--key-file", required=True, type=Path)
    parser.add_argument("--approval", default="")
    parser.add_argument("--restore-proof", type=Path)
    args = parser.parse_args()
    if args.action not in {"key", "inventory"} and args.archive is None:
        parser.error("--archive is required")
    if (
        args.action
        in {"inventory", "backup", "reset", "restore-staging", "prune-backups"}
        and not args.project
    ):
        parser.error("--project is required")
    if args.action == "key":
        with args.key_file.open("xb") as stream:
            os.chmod(args.key_file, 0o600)
            stream.write(Fernet.generate_key())
        print("Encryption key saved; store separately from backup")
        return
    if args.action == "inventory":
        snapshot = query(args.project, snapshot_sql())[0]["snapshot"]
        print(
            json.dumps(
                {
                    "project": args.project,
                    "rows": {k: len(v) for k, v in snapshot["tables"].items()},
                    "images": len(objects(args.project)),
                },
                ensure_ascii=False,
            )
        )
        return
    cipher = Fernet(args.key_file.read_bytes().strip())
    if args.action == "prune-backups":
        print(
            json.dumps(
                {"deleted_archives": prune_backups(args.archive, cipher, args.project)}
            )
        )
        return
    if args.action == "restore-staging":
        if not args.restore_proof:
            parser.error("--restore-proof output path is required")
        restore_staging(
            args.project, args.archive, cipher, args.approval, args.restore_proof
        )
        return
    if args.action == "verify":
        result = verify(args.archive, cipher)
    elif args.action == "backup":
        result = backup(args.project, args.archive, cipher)
    elif args.action == "reset":
        if not args.restore_proof:
            parser.error("--restore-proof is required")
        reset(args.project, args.archive, cipher, args.approval, args.restore_proof)
        return
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
