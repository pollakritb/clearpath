"""Scan exported operational logs for unredacted secret/PII indicators."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

FORBIDDEN_KEYS = {
    "authorization",
    "email",
    "image",
    "image_path",
    "latitude",
    "longitude",
    "lat",
    "lon",
    "lng",
    "password",
    "precise_coordinates",
    "report_image",
    "service_role_key",
    "token",
    "user_id",
}
PATTERNS = {
    "unredacted_email": re.compile(r"(?<!REDACTED_)[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
    "bearer_token": re.compile(r"(?i)bearer\s+(?!\[REDACTED\])[^\s,;]+"),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}"),
    "secret_assignment": re.compile(
        r"(?i)(?:api[_-]?key|password|secret|token)\s*[:=]\s*(?!\[REDACTED\])[^\s,;]+"
    ),
    "precise_coordinate": re.compile(
        r"(?i)(?:lat|latitude|lon|lng|longitude)\s*[:=]\s*-?\d+\.\d{5,}"
    ),
    "supabase_secret": re.compile(r"\bsb_secret_[A-Za-z0-9_-]+"),
}


def _forbidden_paths(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if str(key).lower() in FORBIDDEN_KEYS:
                found.append(path)
            found.extend(_forbidden_paths(child, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_forbidden_paths(child, f"{prefix}[{index}]"))
    return found


def audit_text(text: str) -> dict[str, Any]:
    violations: list[dict[str, Any]] = []
    json_records = 0
    lines = [line for line in text.splitlines() if line.strip()]
    for line_number, line in enumerate(lines, start=1):
        codes = [code for code, pattern in PATTERNS.items() if pattern.search(line)]
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            record = None
        if isinstance(record, dict):
            json_records += 1
            if paths := _forbidden_paths(record):
                codes.extend(f"forbidden_key:{path}" for path in paths)
        if codes:
            violations.append({"line": line_number, "codes": sorted(set(codes))})
    return {
        "passed": not violations,
        "line_count": len(lines),
        "json_record_count": json_records,
        "violation_count": len(violations),
        "violations": violations,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("log_file", type=Path)
    args = parser.parse_args()
    try:
        result = audit_text(args.log_file.read_text(encoding="utf-8"))
    except OSError as exc:
        result = {"passed": False, "error": type(exc).__name__}
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
