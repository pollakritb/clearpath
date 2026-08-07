"""Detect destructive SQL before a Supabase migration is applied."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

DANGEROUS = {
    "drop_table": re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE),
    "truncate": re.compile(r"\bTRUNCATE\b", re.IGNORECASE),
    "delete_storage": re.compile(
        r"\bDELETE\s+FROM\s+storage\.objects\b", re.IGNORECASE
    ),
}


def inspect(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    findings = {
        name: len(pattern.findall(text))
        for name, pattern in DANGEROUS.items()
        if pattern.search(text)
    }
    return {
        "path": path.as_posix(),
        "sha256": hashlib.sha256(text.encode()).hexdigest(),
        "destructive": bool(findings),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--acknowledge-destructive", action="store_true")
    args = parser.parse_args()
    results = [inspect(path) for path in args.paths]
    print(json.dumps(results, indent=2, sort_keys=True))
    blocked = any(result["destructive"] for result in results)
    return 1 if blocked and not args.acknowledge_destructive else 0


if __name__ == "__main__":
    raise SystemExit(main())
