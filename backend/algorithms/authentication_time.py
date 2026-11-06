"""Recent authentication from already verified Supabase AMR claims, never iat."""

from datetime import UTC, datetime
from math import isfinite

METHODS = {"oauth", "password", "otp", "totp", "magiclink", "sso/saml"}


def authentication_time(claims: dict, *, now: datetime) -> str | None:
    timestamps = []
    for item in claims.get("amr", []) if isinstance(claims.get("amr"), list) else []:
        if not isinstance(item, dict) or item.get("method") not in METHODS:
            continue
        timestamp = item.get("timestamp")
        if (
            type(timestamp) not in {int, float}
            or not isfinite(timestamp)
            or not 0 <= timestamp <= now.timestamp()
        ):
            continue
        timestamps.append(timestamp)
    return (
        datetime.fromtimestamp(max(timestamps), UTC).isoformat() if timestamps else None
    )
