from types import SimpleNamespace
from uuid import uuid4

import pytest

from backend.core.identifiers import code, number
from backend.services.identifier_client import IdentifierClient


class Raw:
    def __init__(self, data=None, version=2):
        self.data, self.version, self.calls = data, version, []
        self.aliases = {}

    def table(self, name):
        self.calls.append(("table", name))
        return Query(self, self.data)

    def rpc(self, name, params=None):
        self.calls.append((name, params))
        if name == "identifier_schema_state":
            return Query(self, {"version": self.version, "maintenance": False})
        if name == "identifier_resolve":
            return Query(
                self, self.aliases.get((params["p_entity"], params["p_value"]))
            )
        return Query(self, self.data)


class Query:
    def __init__(self, raw, data):
        self.raw, self.data = raw, data

    @property
    def not_(self):
        self.raw.calls.append(("not_",))
        return self

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.raw.calls.append((name, args, kwargs))
            return self

        return call

    def execute(self):
        return SimpleNamespace(data=self.data)


def test_bigint_codes_are_lossless_and_entity_scoped():
    assert code("community_reports", 9007199254740993) == "RPT-9007199254740993"
    assert code("community_reports", 1000000) == "RPT-1000000"
    assert number("profiles", "USR-000001") == 1
    for value in ["USR-000001", "RPT-0", "RPT-9223372036854775808", "1.0", True]:
        with pytest.raises(ValueError):
            number("community_reports", value)


def test_read_decodes_only_entity_fields_not_auth_tokens_or_audit_json():
    auth, token = str(uuid4()), str(uuid4())
    raw = Raw(
        [
            {
                "id": 9007199254740993,
                "user_id": 12,
                "legacy_id": auth,
                "capture_session_id": 3,
                "image_metadata": {"id": 99, "user_id": auth},
                "image_path": f"drafts/{auth}/x.jpg",
                "lease_token": token,
            }
        ]
    )
    data = (
        IdentifierClient(raw).table("community_reports").select("*").execute().data[0]
    )
    assert data["id"] == "RPT-9007199254740993"
    assert data["user_id"] == "USR-000012"
    assert data["capture_session_id"] == "CAP-000003"
    assert data["legacy_id"] == auth
    assert data["image_metadata"] == {"id": 99, "user_id": auth}
    assert data["image_path"] == f"drafts/{auth}/x.jpg"
    assert data["lease_token"] == token


def test_insert_uses_uuid_only_as_retry_alias_and_database_allocates_pk():
    retry = str(uuid4())
    raw = Raw([])
    IdentifierClient(raw).table("community_reports").upsert(
        {"id": retry, "user_id": "USR-000002", "capture_session_id": "CAP-000003"},
        on_conflict="id",
        ignore_duplicates=True,
    ).execute()
    _, (row,), options = next(c for c in raw.calls if c[0] == "upsert")
    assert row == {"legacy_id": retry, "user_id": 2, "capture_session_id": 3}
    assert options["on_conflict"] == "legacy_id"
    with pytest.raises(ValueError, match="database_generated"):
        IdentifierClient(raw).table("community_reports").insert(
            {"id": "RPT-000001"}
        ).execute()


def test_alias_lookup_is_scoped_cached_and_filters_keep_database_ordering():
    old = str(uuid4())
    raw = Raw([])
    raw.aliases[("profiles", old)] = {
        "numeric_id": 3,
        "legacy_id": old,
        "code": "USR-000003",
    }
    client = IdentifierClient(raw)
    client.table("profiles").select("*").eq("id", old).execute()
    assert ("eq", ("legacy_id", old), {}) in raw.calls
    client.table("measurement_helper_presence").select("*").gt(
        "user_id", "USR-000003"
    ).execute()
    assert ("gt", ("user_id", 3), {}) in raw.calls
    assert client.resolve("profiles", old) == 3
    assert client.resolve("profiles", old) == 3
    assert len([c for c in raw.calls if c[0] == "identifier_resolve"]) == 1
    with pytest.raises(ValueError, match="invalid_rpt_identifier"):
        client.table("community_reports").select("*").eq("id", "USR-000003").execute()


def test_rpc_encodes_entities_but_preserves_opaque_lease_token():
    lease = str(uuid4())
    raw = Raw({"status": "ready", "generation_id": 7})
    data = (
        IdentifierClient(raw)
        .rpc(
            "publish_cams_grid",
            {
                "p_job": "CGJ-000002",
                "p_token": lease,
                "p_frames": [],
                "p_fingerprint": "opaque",
            },
        )
        .execute()
        .data
    )
    assert next(c for c in raw.calls if c[0] == "publish_cams_grid")[1] == {
        "p_job": 2,
        "p_token": lease,
        "p_frames": [],
        "p_fingerprint": "opaque",
    }
    assert data["generation_id"] == "CGN-000007"


def test_notification_transaction_retains_pending_notice_alias_and_retry_key():
    notice_id, outbox_id, retry_key = str(uuid4()), str(uuid4()), str(uuid4())
    raw = Raw(True)
    IdentifierClient(raw).rpc(
        "notify_measurement_request",
        {
            "p_notification": {
                "id": notice_id,
                "user_id": "USR-000001",
                "entity_id": "REQ-000002",
            },
            "p_outbox": {
                "id": outbox_id,
                "user_id": "USR-000001",
                "notification_id": notice_id,
                "payload": {
                    "retry_key": retry_key,
                    "measurement_request_id": "REQ-000002",
                },
            },
        },
    ).execute()
    params = next(c for c in raw.calls if c[0] == "notify_measurement_request")[1]
    assert params["p_notification"]["legacy_id"] == notice_id
    assert params["p_outbox"]["legacy_notification_id"] == notice_id
    assert params["p_outbox"]["payload"]["retry_key"] == retry_key


def test_bridge_switches_atomically_when_database_version_changes():
    old = str(uuid4())
    raw = Raw([{"id": old}], version=1)
    client = IdentifierClient(raw)
    assert client.table("community_reports").select("id").execute().data[0]["id"] == old
    raw.version, raw.data = 2, [{"id": 1}]
    assert (
        client.table("community_reports").select("id").execute().data[0]["id"]
        == "RPT-000001"
    )
    state_calls = len([c for c in raw.calls if c[0] == "identifier_schema_state"])
    client.table("community_reports").select("id").execute()
    assert (
        len([c for c in raw.calls if c[0] == "identifier_schema_state"]) == state_calls
    )


def test_capture_token_issued_before_cutover_still_binds_the_same_user(monkeypatch):
    import hashlib
    import hmac

    from backend.services import capture
    from backend.services import supabase_client as db

    old_user, old_session = str(uuid4()), str(uuid4())
    monkeypatch.setattr(capture.settings, "capture_session_secret", "id-test-secret")
    payload = f"{old_session}.{old_user}.1700000000"
    signature = hmac.new(
        capture._secret(), payload.encode(), hashlib.sha256
    ).hexdigest()
    monkeypatch.setattr(
        db,
        "stable_identifier",
        lambda entity, value: old_user if value == "USR-000001" else str(uuid4()),
    )
    monkeypatch.setattr(
        db,
        "get_capture_session",
        lambda value: {
            "id": "CAP-000001",
            "user_id": "USR-000001",
            "consumed_at": None,
        },
    )
    assert (
        capture.verify_session(payload + "." + signature, "USR-000001", now=1700000100)[
            "session_id"
        ]
        == old_session
    )
    with pytest.raises(ValueError, match="บัญชีนี้"):
        capture.verify_session(payload + "." + signature, "USR-000002", now=1700000100)


def test_legacy_report_preserves_public_pin_and_anonymous_token_after_cutover():
    from datetime import UTC, datetime

    from backend.services.community.presenter import present_report

    old = str(uuid4())
    row = {
        "id": old,
        "user_id": "old-user",
        "lat": 14,
        "lon": 100,
        "pm25": 20,
        "status": "approved",
        "captured_at": datetime.now(UTC).isoformat(),
        "created_at": datetime.now(UTC).isoformat(),
        "show_reporter_profile": False,
    }
    before = present_report(row, include_image=False)
    after = present_report(
        row | {"id": "RPT-000001", "legacy_id": old, "user_id": "USR-000001"},
        include_image=False,
    )
    assert (before["lat"], before["lon"], before["user_id"]) == (
        after["lat"],
        after["lon"],
        after["user_id"],
    )


def test_rollout_pause_blocks_writes_and_get_cron_but_keeps_public_reads(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.main import create_app
    from backend.services import supabase_client as db

    raw = Raw()
    original_rpc = raw.rpc

    def rpc(name, params=None):
        if name == "identifier_schema_state":
            return Query(raw, {"version": 1, "maintenance": True})
        return original_rpc(name, params)

    raw.rpc = rpc
    monkeypatch.setattr(db.settings, "local_demo_mode", False)
    monkeypatch.setattr(db.settings, "supabase_url", "https://example.test")
    monkeypatch.setattr(db.settings, "supabase_service_role_key", "test-secret")
    monkeypatch.setattr(db, "get_client", lambda: IdentifierClient(raw))
    with TestClient(create_app()) as client:
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/community/capture-session").status_code == 503
        assert client.get("/api/cron/sync").status_code == 503


def test_polymorphic_notice_reference_is_readable_without_rewriting_audit_payload():
    report = str(uuid4())
    raw = Raw(
        [
            {
                "id": 1,
                "user_id": 2,
                "entity_type": "community_report",
                "entity_id": report,
                "payload": {"report_id": report},
            }
        ]
    )
    raw.aliases[("community_reports", report)] = {
        "numeric_id": 3,
        "legacy_id": report,
        "code": "RPT-000003",
    }
    data = (
        IdentifierClient(raw).table("user_notifications").select("*").execute().data[0]
    )
    assert data["entity_id"] == "RPT-000003"
    assert data["payload"]["report_id"] == report


def test_inflight_read_crossing_cutover_is_rebuilt_with_numeric_filters():
    old = str(uuid4())
    raw = Raw([{"id": 1}], version=1)
    original_table = raw.table

    def table(name):
        raw.version = 2
        return original_table(name)

    raw.table = table
    data = (
        IdentifierClient(raw)
        .table("community_reports")
        .select("*")
        .eq("id", old)
        .execute()
        .data
    )
    assert data[0]["id"] == "RPT-000001"
    assert ("eq", ("legacy_id", old), {}) in raw.calls


class CleanRaw(Raw):
    def __init__(self, data=None):
        super().__init__(data, version=3)

    def rpc(self, name, params=None):
        if name == "identifier_resolve_many":
            self.calls.append((name, params))
            unique = {}
            for (entity, _), alias in self.aliases.items():
                if (
                    entity == params["p_entity"]
                    and str(alias["numeric_id"]) in params["p_values"]
                ):
                    unique[alias["numeric_id"]] = alias
            return Query(self, list(unique.values()))
        return super().rpc(name, params)


def test_clean_schema_creations_use_atomic_private_alias_rpc():
    retry = str(uuid4())
    raw = CleanRaw([{"id": 41, "source": "test"}])
    result = (
        IdentifierClient(raw)
        .table("sync_runs")
        .upsert({"id": retry, "source": "test", "status": "success"}, on_conflict="id")
        .execute()
        .data
    )
    assert result[0]["id"] == "SYN-000041"
    call = next(c for c in raw.calls if c[0] == "identifier_insert")[1]
    assert call["p_rows"] == [{"source": "test", "status": "success"}]
    assert call["p_keys"] == [retry]
    assert call["p_conflict"] == "id"
    assert call["p_upsert"] is True
    assert not any(c[0] in {"insert", "upsert"} for c in raw.calls)


def test_clean_schema_unknown_uuid_matches_no_public_numeric_key():
    raw = CleanRaw([])
    IdentifierClient(raw).table("profiles").select("*").eq("id", str(uuid4())).execute()
    assert ("eq", ("id", -1), {}) in raw.calls
    assert not any(c[0] == "eq" and c[1][0].startswith("legacy_") for c in raw.calls)


def test_clean_schema_uses_private_batch_mapping_for_stable_privacy_seed():
    report_key = str(uuid4())
    raw = CleanRaw([{"id": 42, "user_id": 7}, {"id": 43, "user_id": 7}])
    for n in (42, 43):
        alias = {
            "numeric_id": n,
            "code": f"RPT-{n:06d}",
            "legacy_id": report_key if n == 42 else str(uuid4()),
        }
        raw.aliases[("community_reports", str(n))] = alias
    client = IdentifierClient(raw)
    result = client.table("community_reports").select("*").execute().data
    assert result[0]["id"] == "RPT-000042"
    assert result[0]["legacy_id"] == report_key
    assert client.identity("community_reports", report_key)["numeric_id"] == 42
    assert len([c for c in raw.calls if c[0] == "identifier_resolve_many"]) == 1
    client.table("community_reports").select("*").execute()
    assert len([c for c in raw.calls if c[0] == "identifier_resolve_many"]) == 1
