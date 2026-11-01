"""Explicit identifier catalog shared by migration QA and database documentation.

Numeric columns are expansion columns until the separately verified PK cutover.
External identifiers and security tokens intentionally do not appear here.
"""

ENTITIES = {
    "profiles": ("USR", "created_at"),
    "capture_sessions": ("CAP", "created_at"),
    "report_drafts": ("DRF", "created_at"),
    "community_reports": ("RPT", "created_at"),
    "report_comments": ("CMT", "created_at"),
    "report_reviews": ("REV", "created_at"),
    "reputation_events": ("REP", "created_at"),
    "measurement_requests": ("REQ", "created_at"),
    "user_notifications": ("NTF", "created_at"),
    "notification_outbox": ("OBX", "created_at"),
    "alert_events": ("ALT", "created_at"),
    "announcements": ("ANN", "created_at"),
    "activities": ("ACT", "created_at"),
    "data_issue_reports": ("ISS", "created_at"),
    "public_map_events": ("MAP", "created_at"),
    "audit_logs": ("AUD", "created_at"),
    "sync_runs": ("SYN", "started_at"),
    "pm25_readings": ("OBS", "recorded_at"),
    "forecast_provider_sync_runs": ("CPS", "started_at"),
    "forecast_provider_snapshots": ("CFS", "created_at"),
    "cams_grid_generations": ("CGN", "started_at"),
    "cams_grid_jobs": ("CGJ", "created_at"),
    "community_xp_events": ("XPE", "recorded_at"),
}

# Real historical references without database FKs. Keep a missing target nullable:
# deleted historical entities must never be fabricated or reassigned.
HISTORICAL_REFERENCES = {
    ("community_xp_events", "report_id"): "community_reports",
    ("community_xp_events", "request_id"): "measurement_requests",
    ("community_xp_events", "requester_id"): "profiles",
    ("public_map_events", "entity_id"): "community_reports",
    ("measurement_requests", "dispatch_cursor"): "profiles",
}


def numeric_column(column: str) -> str:
    return column.removesuffix("_id") + "_numeric_id"


def code_expression(prefix: str, column: str) -> str:
    # LPAD alone truncates values longer than the requested width.
    return (
        f"'{prefix}-' || lpad({column}::text, greatest(6, length({column}::text)), '0')"
    )


def main() -> int:
    """Read-only production inspection; never apply SQL or change migration history."""
    import argparse
    import json
    import os
    from pathlib import Path

    import httpx
    from dotenv import dotenv_values

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--env-file", type=Path, default=Path(".env.deploy.local"))
    parser.add_argument("--require-expanded", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or dotenv_values(args.env_file).get(
        "SUPABASE_ACCESS_TOKEN"
    )
    if not token:
        parser.error("SUPABASE_ACCESS_TOKEN is required (server-side only)")
    with httpx.Client(
        base_url="https://api.supabase.com",
        headers={"Authorization": f"Bearer {token}"},
        timeout=90,
    ) as client:

        def query(sql: str) -> list[dict]:
            response = client.post(
                f"/v1/projects/{args.project_ref}/database/query",
                json={"query": "begin read only; " + sql + "; commit;"},
            )
            response.raise_for_status()
            return response.json()

        columns = query(
            "select table_name,column_name,data_type,is_identity "
            "from information_schema.columns where table_schema='public'"
        )
        catalog = {(c["table_name"], c["column_name"]): c for c in columns}
        state = query("select public.identifier_schema_state() as state")[0]["state"]
        converted = state["version"] >= 2
        results = []
        for table, (prefix, _) in ENTITIES.items():
            numeric = "numeric_id" if (table, "numeric_id") in catalog else "id"
            expanded = (table, "code") in catalog
            result: dict = {"table": table, "prefix": prefix, "expanded": expanded}
            if expanded:
                expected = code_expression(prefix, numeric)
                result.update(
                    query(
                        "select count(*) as rows, "
                        f"count(*) filter(where code is distinct from ({expected})) "
                        f"as invalid_codes, count(distinct {numeric}) as unique_ids "
                        f"from public.{table}"
                    )[0]
                )
                result["valid"] = (
                    result["invalid_codes"] == 0
                    and result["rows"] == result["unique_ids"]
                )
            results.append(result)
        relations = query(
            "select child.relname as table, ca.attname as column, "
            "parent.relname as parent, pa.attname as parent_column "
            "from pg_constraint c "
            "join pg_class child on child.oid=c.conrelid "
            "join pg_namespace cn on cn.oid=child.relnamespace "
            "join pg_class parent on parent.oid=c.confrelid "
            "join pg_namespace pn on pn.oid=parent.relnamespace "
            "cross join lateral unnest(c.conkey,c.confkey) k(ca,pa) "
            "join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=k.ca "
            "join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=k.pa "
            "where c.contype='f' and cn.nspname='public' and pn.nspname='public'"
        )
        references = {
            (r["table"], r["column"]): r["parent"]
            for r in relations
            if r["parent"] in ENTITIES
            and r["parent_column"] == "id"
            and catalog[(r["table"], r["column"])]["data_type"]
            == ("bigint" if converted else "uuid")
        }
        references.update(HISTORICAL_REFERENCES)
        relationship_results = []
        for (table, column), parent in sorted(references.items()):
            shadow = column if converted else numeric_column(column)
            parent_id = "id" if converted else "numeric_id"
            available = (table, shadow) in catalog and (parent, parent_id) in catalog
            mismatches = None
            if available:
                if converted:
                    mismatches = query(
                        "select count(*) as mismatches "
                        f"from public.{table} t left join private.identifier_aliases a "
                        f"on a.entity='{parent}' and a.legacy_id=t.legacy_{column} "
                        f"where t.{column} is distinct from a.numeric_id"
                    )[0]["mismatches"]
                else:
                    mismatches = query(
                        "select count(*) as mismatches "
                        f"from public.{table} t left join public.{parent} p "
                        f"on p.id=t.{column} "
                        f"where t.{shadow} is distinct from p.numeric_id"
                    )[0]["mismatches"]
            relationship_results.append(
                {"table": table, "column": column, "valid": mismatches == 0}
            )
        member_valid = False
        if ("community_xp_accounts", "member_code") in catalog:
            member_column = "member_id" if converted else "member_numeric_id"
            member_expression = code_expression("MBR", member_column)
            member_valid = query(
                "select count(*) filter(where member_code is distinct from ("
                + member_expression
                + f"))=0 and count(distinct {member_column})=count(*) as valid "
                "from public.community_xp_accounts"
            )[0]["valid"]
        report = {
            "project_ref": args.project_ref,
            "schema_version": state["version"],
            "maintenance": state["maintenance"],
            "public_tables": len({c["table_name"] for c in columns}),
            "entities": results,
            "expanded": all(r["expanded"] for r in results),
            "relationships": relationship_results,
            "member_identity_valid": member_valid,
            "valid": (
                all(r.get("valid", False) for r in results)
                and all(r["valid"] for r in relationship_results)
                and member_valid
            ),
            "note": "Version 2 uses numeric PK/FKs; legacy UUIDs remain private compatibility aliases."
            if converted
            else "Expansion does not mean numeric PK/API cutover is complete.",
        }
        print(json.dumps(report, indent=2))
        return int(args.require_expanded and not report["valid"])


if __name__ == "__main__":
    raise SystemExit(main())
