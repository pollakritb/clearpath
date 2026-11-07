"""Isolated PostgreSQL 17 concurrency test. Never accepts a hosted database DSN."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4


def main():
    import psycopg
    from psycopg.types.json import Jsonb

    dsn = os.environ["CONTRIBUTION_V3_TEST_DSN"]
    target = urlparse(dsn)
    if (
        target.hostname not in {"localhost", "127.0.0.1"}
        or target.path != "/contribution_v3_test"
    ):
        raise RuntimeError("isolated_local_test_database_required")

    def migration(suffix):
        return next(Path("supabase/migrations").glob(f"*_{suffix}.sql")).read_text()

    with psycopg.connect(dsn, autocommit=True) as db:
        db.execute(Path("backend/tests/fixtures/identifiers_baseline.sql").read_text())
        db.execute(migration("identifier_rollout_control"))
        db.execute(
            "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)"
        )
        for _ in range(8):
            uid = uuid4()
            db.execute("insert into auth.users values(%s)", (uid,))
            db.execute("insert into profiles(id) values(%s)", (uid,))
        db.execute(migration("readable_identifiers_expand"))
        db.execute("update private.identifier_control set maintenance=true")
        db.execute(migration("numeric_identifier_cutover"))
        db.execute(migration("private_identifier_aliases"))
        db.execute("update private.identifier_control set maintenance=false")
        db.execute(migration("registered_measurement_locations"))
        db.execute("update measurement_request_control set registered_enabled=true")
        if os.environ.get("CONTRIBUTION_V3_FOUNDATION_PRESENT") == "true":
            db.execute(migration("contribution_evidence_v2"))
        else:
            db.execute(
                "alter table report_reactions add column reason_code text;alter table report_reactions add column geofence_policy text"
            )
        db.execute(migration("contribution_v3_prerequisites"))
        db.execute(migration("measurement_request_radius_2km"))
        db.execute(migration("contribution_v3"))
        db.execute(
            "update community_xp_control set enabled=true;update contribution_v3_control set enabled=true,starts_at='2026-10-01T00:00:00+07:00'"
        )

    def submit(user, at, *, session=None):
        with psycopg.connect(dsn, autocommit=True) as db:
            session = db.execute(
                "insert into capture_sessions(user_id,issued_at,expires_at) values(%s,%s,%s) returning id",
                (user, at - timedelta(minutes=2), at + timedelta(minutes=2)),
            ).fetchone()[0]
            rid = db.execute(
                "insert into community_reports(user_id,capture_session_id,lat,lon,pm25,status,captured_at,created_at,moderated_at,capture_source,public_lat,public_lon,measurement_environment,gps_accuracy_m) values(%s,%s,13.8,100.1,22,'approved',%s,%s,%s,'camera',13.801,100.101,'outdoor',20) returning id",
                (user, session, at - timedelta(minutes=1), at, at),
            ).fetchone()[0]
            row = db.execute(
                "select to_jsonb(r) from community_reports r where id=%s", (rid,)
            ).fetchone()[0]
            evidence = {
                "image_metadata": {
                    "evidence_extraction": {
                        "pm25_field_verified": True,
                        "unit_verified": True,
                    },
                    "bonus_gps_at_submission": {
                        "lat": 13.8,
                        "lon": 100.1,
                        "accuracy_m": 20,
                    },
                }
            }
            db.execute(
                "insert into community_xp_jobs(report_id,user_id,state,report_snapshot,evidence_snapshot,occurred_at) values(%s,%s,'pending',%s,%s,%s) on conflict(report_id) do nothing",
                (rid, user, Jsonb(row), Jsonb(evidence), at),
            )
            return rid

    def worker(_):
        with psycopg.connect(dsn, autocommit=True) as db:
            db.execute("select process_measurement_report_jobs(100)")
            return db.execute("select process_community_xp(100)").fetchone()[0]

    at = datetime(2026, 10, 26, 3, tzinfo=UTC)
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(lambda _: submit(1, at), range(8)))
        list(pool.map(worker, range(8)))
    for i in range(12):
        worker(i)
    with psycopg.connect(dsn, autocommit=True) as db:
        awarded = db.execute(
            "select report_id from community_xp_events where user_id=1 and kind='report' and points>0"
        ).fetchall()
        assert awarded == [(min(ids),)], awarded
        assert (
            db.execute("select lifetime_xp from community_xp_totals(1)").fetchone()[0]
            == 15
        )
        assert (
            db.execute(
                "select count(*) from community_xp_events where user_id=1 and kind='first_day'"
            ).fetchone()[0]
            == 1
        )
    # Earlier server submission beats later jobs even when the enqueue order is reversed.
    late = submit(2, at + timedelta(minutes=15))
    early = submit(2, at)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(worker, range(4)))
    for i in range(4):
        worker(i)
    with psycopg.connect(dsn, autocommit=True) as db:
        assert db.execute(
            "select report_id from community_xp_events where user_id=2 and kind='report' and points>0"
        ).fetchall() == [(early,)]
        assert late != early
        # Reversal uniqueness survives concurrent compensation requests.
        event = db.execute(
            "select id from community_xp_events where report_id=%s and kind='report'",
            (early,),
        ).fetchone()[0]

    def reverse(_):
        with psycopg.connect(dsn, autocommit=True) as db:
            db.execute(
                "select reverse_community_xp(%s,'isolated-confirmed-duplicate-award')",
                (event,),
            )
            db.execute("select reconcile_contribution_v3()")

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(reverse, range(8)))
    with psycopg.connect(dsn, autocommit=True) as db:
        assert (
            db.execute("select lifetime_xp from community_xp_totals(2)").fetchone()[0]
            == 0
        )
        assert (
            db.execute(
                "select count(*) from community_xp_events where reverses=%s", (event,)
            ).fetchone()[0]
            == 1
        )
        for role in ("anon", "authenticated"):
            assert not db.execute(
                "select has_function_privilege(%s,'public.set_contribution_v3_release(boolean,timestamptz,boolean,jsonb,text)','execute')",
                (role,),
            ).fetchone()[0]
    print(
        "PostgreSQL 17: concurrent submissions, deterministic tie/order, retry, single first-day bonus, concurrent reversals and role isolation passed"
    )


if __name__ == "__main__":
    main()
