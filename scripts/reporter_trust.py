"""Independent reporter audits: validate/import, or compare candidate priors.

Dry-run by default. Never substitutes OCR approval or votes for independent cases.
"""

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.algorithms.reporter_trust import reporter_trust
from backend.services.community.reporter_trust import ReporterAudit, ingest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["import", "sensitivity"])
    parser.add_argument("file", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.apply and args.operation != "import":
        parser.error("--apply is only available for import")
    rows = [
        ReporterAudit.model_validate(json.loads(line)).model_dump(mode="json")
        for line in args.file.read_text().splitlines()
        if line.strip()
    ]
    if not rows:
        parser.error("independent audit dataset is empty")
    subjects = sorted({row["user_id"] for row in rows})
    if args.operation == "import":
        if args.apply:
            for row in rows:
                ingest(row)
        result = {
            "schema_validated": len(rows),
            "applied": args.apply,
            "database_identity_revision_checks": "during_apply"
            if args.apply
            else "not_run",
        }
    else:
        # Subject-level results, without raw identifiers or private audit references.
        result = {
            "scope": "candidate_prior_sensitivity_not_field_validation",
            "subject_count": len(subjects),
            "priors": {
                str(prior): [
                    reporter_trust(
                        [r for r in rows if r["user_id"] == user],
                        now=datetime.now(UTC),
                        prior=prior,
                    )
                    for user in subjects
                ]
                for prior in [1, 2]
            },
        }
    result["artifact_sha256"] = hashlib.sha256(args.file.read_bytes()).hexdigest()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
