"""Opaque, filter-bound keyset cursors. Authorization remains at the HTTP boundary."""

import base64
import hashlib
import json
from datetime import UTC, datetime


def _scope(action, entity_type):
    return hashlib.sha256(
        json.dumps([action, entity_type], separators=(",", ":")).encode()
    ).hexdigest()


def encode_audit_cursor(row: dict, action=None, entity_type=None) -> str:
    body = {
        "v": 1,
        "at": row["created_at"],
        "id": int(row["id"]),
        "scope": _scope(action, entity_type),
    }
    return (
        base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode())
        .decode()
        .rstrip("=")
    )


def decode_audit_cursor(value: str, action=None, entity_type=None) -> tuple[str, int]:
    try:
        if not isinstance(value, str) or not 1 <= len(value) <= 1024:
            raise ValueError()
        body = json.loads(
            base64.b64decode(
                value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
            )
        )
        at = datetime.fromisoformat(body["at"].replace("Z", "+00:00"))
        identifier = body["id"]
        if (
            body["v"] != 1
            or body["scope"] != _scope(action, entity_type)
            or at.tzinfo is None
            or type(identifier) is not int
            or not 0 < identifier < 2**63
        ):
            raise ValueError()
        return at.astimezone(UTC).isoformat(), identifier
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError) as exc:
        raise ValueError("audit_cursor_invalid") from exc
