"""Render a sanitized schema inventory from the metadata-only readiness audit."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

GROUPS = {
    "cams_grid_": (
        "CAMS grid",
        "72h; protect active + previous ready; new migration pending",
    ),
    "forecast_provider_": (
        "CAMS station compatibility",
        "Retire only after grid cutover + verified backup",
    ),
    "community_trust_private.": (
        "Community Trust",
        "365d policy; preserve actionable reviews and scoring invariants",
    ),
    "community_xp_": (
        "XP ledger/control",
        "Preserve existing totals, settlement and deduplication",
    ),
    "contribution_v3_": (
        "Contribution v3",
        "Preserve release evidence and ledger dependencies",
    ),
    "measurement_": (
        "Measurement requests/queues",
        "Existing policy; preserve leased/retryable jobs and deduplication",
    ),
    "line_": (
        "LINE delivery",
        "Existing policy; inbox terminal 30d; protect retries/budgets/cursors",
    ),
    "external_": (
        "Scheduled external feeds",
        "Existing feed cleanup; verify runtime execution",
    ),
    "report_": (
        "Community evidence/social",
        "Existing evidence/audit retention; no blanket telemetry purge",
    ),
    "community_": (
        "Community policy/audit",
        "Preserve until runtime + ledger dependency review",
    ),
    "air_alert_": (
        "GPS alerts",
        "Locations 24h; preserve delivery state through retry window",
    ),
}
EXPLICIT = {
    "profiles": (
        "Accounts",
        "Owner-confirmed erasure lifecycle; retain anonymous report references",
    ),
    "account_privacy_requests": (
        "Account closure",
        "Preserve erasure evidence and retry linkage",
    ),
    "private.account_erasure_jobs": (
        "Account closure queue",
        "Preserve unfinished jobs; no guessed TTL",
    ),
    "private.identifier_aliases": (
        "Identifier compatibility",
        "Only remove verified retired telemetry aliases",
    ),
    "private.identifier_control": ("Identifier control", "Persistent configuration"),
    "private.history_retention_state": (
        "Retention monitoring",
        "Latest bounded-cleanup result",
    ),
    "stations": ("Official station catalog", "Persistent source catalog"),
    "pm25_readings": ("Official observations", "72h existing retention"),
    "sync_runs": ("Official ingestion telemetry", "72h existing retention"),
    "rate_limit_windows": ("Abuse protection", "72h existing retention"),
    "audit_logs": ("Audit", "No new deletion policy authorized"),
    "notification_outbox": (
        "Delivery queue",
        "Protect pending, retries and idempotency",
    ),
    "notification_preferences": ("User consent", "Preserve until owner update/closure"),
    "user_notifications": (
        "User notification history",
        "Existing policy; no new deletion TTL",
    ),
    "capture_sessions": (
        "Capture security",
        "Keep evidence references; verify expiry cleanup",
    ),
    "reputation_events": (
        "Historical reputation ledger",
        "Preserve settlement and aggregate invariants",
    ),
    "data_issue_reports": (
        "Historical issues/audit",
        "Audit-only; do not drop based on retired UI",
    ),
    "public_map_events": (
        "Map refresh events",
        "Existing policy; verify consumers before pruning",
    ),
    "alert_events": (
        "Alert idempotency",
        "At least delivery retry window; do not blindly purge",
    ),
    "activities": ("Published activities", "Persistent published content"),
    "announcements": ("Published announcements", "Persistent published content"),
}


def classify(schema: str, name: str) -> tuple[str, str]:
    if schema + "." + name in EXPLICIT:
        return EXPLICIT[schema + "." + name]
    if name in EXPLICIT:
        return EXPLICIT[name]
    for prefix, value in GROUPS.items():
        if name.startswith(prefix) or (schema + "." + name).startswith(prefix):
            return value
    return (
        "Review required",
        "KEEP: no deletion authorized until dependency/policy review",
    )


def render(catalog: dict) -> str:
    tables = [
        t
        for t in catalog["tables"]
        if t["schema"] in {"public", "private", "community_trust_private"}
    ]
    lines = [
        "# Database inventory — current catalog",
        "",
        "Generated from a read-only catalog audit. Estimates are not exact row counts. This is not a backup or proof of runtime authorization.",
        "",
        f"Catalog as of: `{catalog['as_of']}`. Application tables: **{len(tables)}**. Latest recorded migration: `{catalog['migrations'][-1]}`.",
        "",
        "New CAMS reader and retention migration is local only. Retention descriptions preserve existing policy; KEEP means no additional deletion is authorized.",
        "",
        "| Table | Purpose | Estimated rows | MiB incl. indexes | RLS | Retention / safety |",
        "|---|---|---:|---:|---|---|",
    ]
    for t in tables:
        purpose, retention = classify(t["schema"], t["name"])
        lines.append(
            f"| `{t['schema']}.{t['name']}` | {purpose} | {t['estimated_rows']} | {t['total_bytes'] / 1048576:.2f} | {'on' if t['rls'] else 'off; private grants require review'} | {retention} |"
        )
    lines += ["", "## Columns and integrity", ""]
    for t in tables:
        schema, name = t["schema"], t["name"]
        lines += [
            f"### `{schema}.{name}`",
            "",
            "| Column | Type | Nullable | Identity / generated |",
            "|---|---|---|---|",
        ]
        for c in catalog["columns"]:
            if c["schema"] == schema and c["table"] == name:
                lines.append(
                    f"| `{c['name']}` | {c['type']} | {c['nullable']} | {c['identity']} / {c['generated']} |"
                )
        lines += ["", "Constraints:", ""]
        for c in catalog["constraints"] or []:
            if c["schema"] == schema and c["table"] == name:
                lines.append(
                    f"- `{c['name']}`: `{c['definition']}`; validated={c['validated']}"
                )
        lines.append("")
    lines += [
        "## Access boundary",
        "",
        "Public table RLS status is a catalog check only. Backend service-role operations still require owner/admin checks. Private schemas must remain unexposed. Never infer that an empty table or retired UI is safe to delete.",
        "",
        "Managed auth, storage, realtime, cron, net, vault and migration-history objects are excluded from application ownership. Preserve them with service-supported backup procedures; do not hand-delete their tables.",
        "",
    ]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("catalog", type=Path)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    args.output.write_text(render(json.loads(args.catalog.read_text())))


if __name__ == "__main__":
    main()
