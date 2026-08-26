"""Pure LINE webhook and one-time link-code security helpers."""

import base64
import hashlib
import hmac
import re

LINK_CODE_PATTERN = re.compile(r"\bCP-([A-Z2-9]{8})\b", re.IGNORECASE)
LINE_USER_ID_PATTERN = re.compile(r"^U[0-9a-f]{32}$", re.IGNORECASE)


def valid_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not signature or not channel_secret:
        return False
    digest = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


def hash_link_code(code: str, channel_secret: str) -> str:
    normalized = code.strip().upper()
    return hmac.new(
        channel_secret.encode(), normalized.encode(), hashlib.sha256
    ).hexdigest()


def extract_link_code(text: str) -> str | None:
    match = LINK_CODE_PATTERN.search(text.strip())
    return f"CP-{match.group(1).upper()}" if match else None


def valid_line_user_id(value: str) -> bool:
    """Accept only one-to-one LINE user IDs, never group or room targets."""
    return bool(LINE_USER_ID_PATTERN.fullmatch(value.strip()))
