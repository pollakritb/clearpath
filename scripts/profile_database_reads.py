"""Bounded EXPLAIN (no ANALYZE) of fixed application reads. No query/row payload logging."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from dotenv import dotenv_values

from scripts.audit_database_readiness import PROJECT, ROOT

QUERIES = {
    "grid_point": "select valid_at,values[1] from public.cams_grid_frames where generation_id=(select generation_id from public.cams_grid_active where id=1) and valid_at>now() and valid_at<=now()+interval '120 hours' order by valid_at limit 120",
    "map_history": "select id,captured_at from public.community_reports where status='approved' and captured_at>now()-interval '3 hours' and captured_at<=now() and created_at<=now() order by captured_at,id limit 1000",
    "preferences": "select user_id from public.notification_preferences order by user_id limit 1000",
    "audit": "select id,created_at from public.audit_logs order by created_at desc,id desc limit 100",
}


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or dotenv_values(
        ROOT / ".env.deploy.local"
    ).get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise ValueError("missing scoped token")
    directories = sorted(
        (Path.home() / "Library/Application Support/ClearPath/Backups").glob(
            "readiness-*"
        )
    )
    if not directories:
        raise ValueError("run metadata audit first")
    result = {}
    with httpx.Client(
        timeout=15, headers={"Authorization": f"Bearer {token}"}
    ) as client:
        for name, sql in QUERIES.items():
            r = client.post(
                f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
                json={
                    "query": "begin read only;set local statement_timeout='3s';explain(format json) "
                    + sql
                    + ";commit;"
                },
            )
            if not r.is_success:
                raise RuntimeError(f"{name} read-only EXPLAIN HTTP {r.status_code}")
            result[name] = r.json()
    p = directories[-1] / "read-plans.json"
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(result, out, indent=2)
    print(
        json.dumps(
            {
                "path": str(p),
                "queries": list(result),
                "analyze": False,
                "production_mutations": False,
            }
        )
    )


if __name__ == "__main__":
    main()
