import base64
import hashlib
import hmac
from datetime import UTC, datetime, timedelta

from backend.algorithms.line_security import (
    extract_link_code,
    hash_link_code,
    valid_line_signature,
    valid_line_user_id,
)
from backend.core.config import settings
from backend.services import line_messaging


def test_line_signature_uses_raw_request_body():
    body = b'{"events":[]}'
    secret = "channel-secret"
    signature = base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode()
    assert valid_line_signature(body, signature, secret)
    assert not valid_line_signature(body + b" ", signature, secret)


def test_link_code_parsing_and_hashing_are_normalized():
    assert extract_link_code("เชื่อม clearpath cp-abcd2345 ครับ") == "CP-ABCD2345"
    assert extract_link_code("hello") is None
    assert hash_link_code("cp-abcd2345", "secret") == hash_link_code(
        "CP-ABCD2345", "secret"
    )


def test_line_user_id_accepts_only_direct_user_targets():
    assert valid_line_user_id("U0123456789abcdef0123456789abcdef")
    assert not valid_line_user_id("C0123456789abcdef0123456789abcdef")
    assert not valid_line_user_id("U-short")


def test_line_link_code_expiry_and_account_mismatch_fail_closed(monkeypatch):
    monkeypatch.setattr(settings, "line_channel_secret", "channel-secret")
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link_by_code",
        lambda _code_hash: {
            "user_id": "clearpath-user",
            "link_code_expires_at": (
                datetime.now(UTC) - timedelta(seconds=1)
            ).isoformat(),
        },
    )
    assert (
        line_messaging._link("CP-ABCD2345", "U0123456789abcdef0123456789abcdef")
        is False
    )

    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link_by_code",
        lambda _code_hash: {
            "user_id": "clearpath-user",
            "link_code_expires_at": (
                datetime.now(UTC) + timedelta(minutes=5)
            ).isoformat(),
        },
    )
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link_by_line_user",
        lambda _line_user_id: {"user_id": "different-clearpath-user"},
    )
    assert (
        line_messaging._link("CP-ABCD2345", "U0123456789abcdef0123456789abcdef")
        is False
    )


def test_line_relink_same_account_rotates_one_time_code(monkeypatch):
    monkeypatch.setattr(settings, "line_channel_secret", "channel-secret")
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link_by_code",
        lambda _code_hash: {
            "user_id": "clearpath-user",
            "link_code_expires_at": (
                datetime.now(UTC) + timedelta(minutes=5)
            ).isoformat(),
        },
    )
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link_by_line_user",
        lambda _line_user_id: {"user_id": "clearpath-user"},
    )
    updates: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "upsert_line_notification_link",
        lambda user_id, values: updates.append((user_id, values)),
    )
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "upsert_notification_preferences",
        lambda user_id, values: updates.append((user_id, values)),
    )
    assert (
        line_messaging._link("CP-ABCD2345", "U0123456789abcdef0123456789abcdef") is True
    )
    assert updates[0][1]["link_code_hash"] is None
    assert updates[0][1]["link_code_expires_at"] is None
    assert updates[0][1]["active"] is True
