"""Validate traceable rollout evidence; never creates evidence or activates flags.

A valid manifest makes evidence reviewable, not scientifically validated by itself.
Independent reviewers remain responsible for its claims and acceptance criteria.
"""

import argparse
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path

REQUIRED = {
    "staging_migration",
    "independent_trust_evaluation",
    "gap_fill_evaluation",
    "device_iphone",
    "device_android",
    "gps_boundary",
    "line_delivery",
    "registered_request_fanout",
    "restore_drill",
    "privacy_retention",
    "provider_licenses",
    "pilot_acceptance",
}


def validate_manifest(path: Path, expected_commit: str | None = None) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return ["readiness_manifest_unreadable"]
    if not isinstance(data, dict):
        return ["readiness_manifest_must_be_object"]
    if data.get("scope") != "production-readiness" or not data.get("accepted_by"):
        errors.append("production_scope_and_accountable_reviewer_required")
    source = data.get("source_commit", "")
    if not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{40}", source):
        errors.append("reviewed_source_commit_required")
    elif expected_commit and source != expected_commit:
        errors.append("reviewed_source_commit_mismatch")
    if data.get("reporter_trust_prior") != [2, 2]:
        errors.append("reporter_trust_prior_mismatch")
    records = data.get("evidence", {})
    if not isinstance(records, dict):
        return errors + ["evidence_must_be_object"]
    for key in sorted(REQUIRED):
        record = records.get(key)
        if (
            not isinstance(record, dict)
            or record.get("accepted") is not True
            or record.get("kind") != "real"
        ):
            errors.append(key + ":real_accepted_evidence_required")
            continue
        try:
            at = datetime.fromisoformat(record["checked_at"].replace("Z", "+00:00"))
            if (
                at.tzinfo is None
                or at > datetime.now(UTC)
                or not record.get("reviewer")
            ):
                raise ValueError("invalid evidence date/reviewer")
            artifact = (path.parent / record["artifact"]).resolve()
            if (
                not artifact.is_file()
                or hashlib.sha256(artifact.read_bytes()).hexdigest() != record["sha256"]
            ):
                raise ValueError("artifact mismatch")
        except (OSError, KeyError, ValueError, TypeError):
            errors.append(key + ":verified_artifact_hash_date_and_reviewer_required")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    errors = validate_manifest(args.manifest)
    print(
        json.dumps(
            {"ready_for_review": not errors, "missing_or_invalid": errors},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
