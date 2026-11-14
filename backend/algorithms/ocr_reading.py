"""Parse a literal meter display without inventing decimal places."""

import re
import unicodedata


def parse_pm25_display(text: object) -> float | None:
    """Accept one visible numeric token; leading zeros do not imply decimals."""
    if not isinstance(text, str):
        return None
    token = unicodedata.normalize("NFKC", text).strip()
    if len(token) > 32 or not re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?", token):
        return None
    return float(token.replace(",", "."))
