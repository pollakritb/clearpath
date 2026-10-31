"""Pure SQL builders for the separately approved, one-time community reset."""

# SQL identifiers are fixed here, never interpolated from user input.
TABLES = (
    "community_xp_jobs",
    "community_xp_events",
    "community_help_claims",
    "community_xp_accounts",
    "measurement_request_recipients",
    "measurement_delivery_leases",
    "measurement_requests",
    "report_reviews",
    "report_reactions",
    "report_comments",
    "report_evidence",
    "report_drafts",
    "reputation_events",
    "community_reports",
    "capture_sessions",
    "community_forecast_feature_snapshots",
    "public_map_events",
)
FILTERS = {
    "user_notifications": "entity_type in ('community_report','measurement_request') or event_type in ('rating','reward','report_status','measurement_request','measurement_fulfilled','measurement_expired')",
    "notification_outbox": "notification_id in (select id from public.user_notifications where entity_type in ('community_report','measurement_request') or event_type in ('rating','reward','report_status','measurement_request','measurement_fulfilled','measurement_expired')) or payload ? 'measurement_request_id'",
    "audit_logs": "entity_type in ('community_report','report_draft','measurement_request','reputation_event')",
}
ALL_TABLES = (
    *TABLES,
    "notification_outbox",
    "user_notifications",
    "audit_logs",
    "measurement_helper_presence",
    "profiles",
)


def scope(table: str) -> str:
    if table == "profiles":
        return "select id,reputation_score,approved_reports,helpful_reviews from public.profiles"
    return f"select * from public.{table}" + (
        f" where {FILTERS[table]}" if table in FILTERS else ""
    )


def fingerprint_sql(table: str) -> str:
    return f"select count(*) n,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) hash from ({scope(table)}) t"


def snapshot_sql() -> str:
    fields = ",".join(
        f"'{table}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ({scope(table)}) t)"
        for table in ALL_TABLES
    )
    fingerprints = ",".join(
        f"'{table}',(select to_jsonb(f) from ({fingerprint_sql(table)}) f)"
        for table in ALL_TABLES
    )
    return f"select jsonb_build_object('tables',jsonb_build_object({fields}),'fingerprints',jsonb_build_object({fingerprints})) snapshot"


def reset_sql(manifest: dict) -> str:
    digest = manifest["sha256"]
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("invalid manifest digest")
    checks = []
    for table in ALL_TABLES:
        expected = manifest["fingerprints"][table]
        h = expected["hash"]
        if len(h) != 32 or any(c not in "0123456789abcdef" for c in h):
            raise ValueError("invalid fingerprint")
        checks.append(
            f"if (select hash from ({fingerprint_sql(table)}) f)<>'{h}' then raise exception 'backup stale: {table}'; end if;"
        )
    deletions = "\n".join(f"delete from public.{table};" for table in TABLES)
    return f"""begin;
set local clearpath.community_reset='approved';
lock table {",".join("public." + t for t in ALL_TABLES)} in share row exclusive mode;
do $$ begin
 if not exists(select 1 from public.community_xp_control where maintenance) then raise exception 'maintenance required'; end if;
 if exists(select 1 from public.community_xp_control where reset_manifest='{digest}') then return; end if;
 {"".join(checks)}
 delete from public.notification_outbox where {FILTERS["notification_outbox"]};
 delete from public.user_notifications where {FILTERS["user_notifications"]};
 delete from public.audit_logs where {FILTERS["audit_logs"]};
 {deletions}
 update public.measurement_helper_presence set lat=null,lon=null,accuracy_m=null,observed_at=null;
 update public.profiles set reputation_score=0,approved_reports=0,helpful_reviews=0;
 update public.community_xp_control set enabled=false,reset_version=gen_random_uuid(),reset_manifest='{digest}';
end $$;
commit;"""
