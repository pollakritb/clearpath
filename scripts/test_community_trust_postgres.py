"""Real PostgreSQL concurrency acceptance. Only an explicitly named local test DB.

COMMUNITY_TRUST_TEST_DSN=postgresql://.../community_trust_test python -m scripts.test_community_trust_postgres
Requires psycopg (installed only in the isolated CI test job).
"""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4


def main():
    import psycopg
    from psycopg.types.json import Jsonb

    dsn = os.environ["COMMUNITY_TRUST_TEST_DSN"]
    target = urlparse(dsn)
    if (
        target.hostname not in {"localhost", "127.0.0.1"}
        or target.path != "/community_trust_test"
    ):
        raise RuntimeError("isolated_local_test_database_required")
    with psycopg.connect(dsn, autocommit=True) as db:
        db.execute(
            "create role anon;create role authenticated;create role service_role bypassrls"
        )
        db.execute(
            "create table profiles(id bigint primary key);create table community_reports(id bigint primary key,user_id bigint,status text,captured_at timestamptz,image_path text,evidence_purged_at timestamptz,lat float8,lon float8,image_sha256 text,created_at timestamptz default now());create table report_reactions(report_id bigint,user_id bigint,reaction text,created_at timestamptz,updated_at timestamptz,primary key(report_id,user_id))"
        )
        db.execute(
            Path(
                "supabase/migrations/20261107112234_community_trust_v1.sql"
            ).read_text()
        )
        db.execute(
            Path(
                "supabase/migrations/20261107123554_community_trust_gps_clock.sql"
            ).read_text()
        )
        db.execute(
            "insert into profiles select generate_series(1,20);update community_trust_private.control set collecting_enabled=true,notice_ref='isolated-concurrency-test-notice';insert into community_reports select n,1,'approved',now(),'test/image',null,13.8,100.1,n::text from generate_series(101,110) n"
        )

    def vote(voter, report, key):
        payload = {
            "policy_version": "community-trust-v1",
            "reaction": "like",
            "reason_code": "useful",
            "evidence_available": True,
            "location": {
                "lat": 13.8,
                "lon": 100.1,
                "accuracy_m": 1,
                "observed_at": datetime.now(UTC).isoformat(),
            },
        }
        with psycopg.connect(dsn, autocommit=True) as db:
            return db.execute(
                "select community_trust_react(%s,%s,%s,'set',%s)",
                (voter, report, key, Jsonb(payload)),
            ).fetchone()[0]

    key = uuid4()
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _: vote(2, 101, key), range(10)))
    assert all(r == results[0] for r in results)
    with psycopg.connect(dsn, autocommit=True) as db:
        assert (
            db.execute(
                "select count(*) from community_trust_private.events where action='set'"
            ).fetchone()[0]
            == 1
        )
        assert db.execute("select count(*) from report_reactions").fetchone()[0] == 1
        # Two original reaction days compete for the single remaining pair admission.
        db.execute(
            "insert into community_trust_private.pair_days values(3,1,(now() at time zone 'Asia/Bangkok')::date-2,true,now()),(3,1,(now() at time zone 'Asia/Bangkok')::date-3,true,now());insert into community_trust_private.reactions values(3,102,1,(now() at time zone 'Asia/Bangkok')::date-1,'like','useful',false,now()-interval '1 day',now())"
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(vote, 3, report, uuid4()) for report in (102, 103)]
        outcomes = [f.result() for f in futures]
    assert sum(r["trust_eligible"] for r in outcomes) == 1
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(lambda user: vote(user, 104, uuid4()), range(4, 14)))
    with psycopg.connect(dsn, autocommit=True) as db:
        assert (
            db.execute(
                "select count(*) from community_trust_private.pair_days where voter_id=3 and admitted"
            ).fetchone()[0]
            == 3
        )
        assert (
            db.execute("select count(*) from community_trust_private.holds").fetchone()[
                0
            ]
            == 1
        )
        assert not db.execute(
            "select community_trust_store_projection(1,0,'{\"daily\":[]}'::jsonb)"
        ).fetchone()[0]
    with psycopg.connect(dsn, autocommit=True) as db:
        snapshot = db.execute("select community_trust_snapshot(1)").fetchone()[0]
        assert len(snapshot["events"]) > 10
        assert snapshot["contribution_days_30"] == 1
    print(
        "Real PostgreSQL: concurrent retries, unique reaction, competing pair-day admissions, single hold and stale projection CAS passed"
    )


if __name__ == "__main__":
    main()
