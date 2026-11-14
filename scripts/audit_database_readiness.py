"""Read-only catalog audit to a private, local directory; never captures row data.

This is evidence, NOT a backup. All API calls execute fixed SQL in READ ONLY
transactions with an eight-second statement budget. No production writes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import httpx
from dotenv import dotenv_values

PROJECT = "kmvxwfrmmictzuxbsncr"
ROOT = Path(__file__).resolve().parents[1]


def audit(directory: Path, env_file: Path) -> dict:
    directory = directory.expanduser().resolve()
    if directory == ROOT or ROOT in directory.parents:
        raise ValueError("audit output must be outside the repository")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or dotenv_values(env_file).get(
        "SUPABASE_ACCESS_TOKEN"
    )
    if not token:
        raise ValueError("missing scoped SUPABASE_ACCESS_TOKEN")
    sql = (ROOT / "scripts/sql/database_readiness_audit.sql").read_text()
    with httpx.Client(
        timeout=20, headers={"Authorization": f"Bearer {token}"}
    ) as client:
        response = client.post(
            f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
            json={
                "query": "begin read only; set local statement_timeout='8s'; "
                + sql
                + " commit;"
            },
        )
        if not response.is_success:
            raise RuntimeError(
                f"read-only audit HTTP {response.status_code}; response withheld"
            )
        result = response.json()[0]["audit"]
    directory.mkdir(parents=True, mode=0o700, exist_ok=False)
    directory.chmod(0o700)
    body = json.dumps(result, ensure_ascii=False, indent=2).encode()
    path = directory / "catalog.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(body)
    manifest = {
        "project": PROJECT,
        "as_of": result["as_of"],
        "sha256": hashlib.sha256(body).hexdigest(),
        "kind": "metadata-only-not-backup",
        "disk_wal_headroom": "not_verified",
        "production_mutations": False,
    }
    path = directory / "manifest.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(manifest, out, indent=2)
    return {
        "directory": str(directory),
        "database_bytes": result["database_bytes"],
        "tables": len(result["tables"]),
        "latest_migration": result["migrations"][-1],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--directory",
        type=Path,
        default=Path.home()
        / "Library/Application Support/ClearPath/Backups"
        / ("readiness-" + datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")),
    )
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.deploy.local")
    args = parser.parse_args()
    print(json.dumps(audit(args.directory, args.env_file)))


if __name__ == "__main__":
    main()
