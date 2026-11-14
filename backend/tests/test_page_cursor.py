from datetime import UTC, datetime

import pytest

from backend.algorithms.page_cursor import decode_audit_cursor, encode_audit_cursor
from backend.services import local_store, store_client, store_operations


def test_filter_bound_cursor_and_invalid_payloads():
    row = {"id": 9223372036854775806, "created_at": "2030-01-01T07:00:00+07:00"}
    token = encode_audit_cursor(row, "submit", "report")
    assert decode_audit_cursor(token, "submit", "report") == (
        "2030-01-01T00:00:00+00:00",
        row["id"],
    )
    for invalid in ["!", token + "!", "x" * 1025]:
        with pytest.raises(ValueError):
            decode_audit_cursor(invalid, "submit", "report")
    with pytest.raises(ValueError):
        decode_audit_cursor(token, "other", "report")


def test_keyset_handles_equal_timestamps_new_insert_and_deleted_row(monkeypatch):
    monkeypatch.setattr(store_client.settings, "local_demo_mode", True)
    at = datetime.now(UTC).isoformat()
    monkeypatch.setattr(
        local_store,
        "_AUDIT_LOGS",
        [
            {"id": i, "created_at": at, "action": "test", "entity_type": "report"}
            for i in range(1, 7)
        ],
    )
    first = store_operations.list_audit_logs_after(3)
    assert [r["id"] for r in first] == [6, 5, 4]
    cursor = decode_audit_cursor(encode_audit_cursor(first[-1]))
    local_store._AUDIT_LOGS.append(
        {"id": 7, "created_at": at, "action": "test", "entity_type": "report"}
    )
    local_store._AUDIT_LOGS[:] = [r for r in local_store._AUDIT_LOGS if r["id"] != 5]
    second = store_operations.list_audit_logs_after(3, cursor)
    assert [r["id"] for r in second] == [3, 2, 1]
    assert not ({r["id"] for r in first} & {r["id"] for r in second})
