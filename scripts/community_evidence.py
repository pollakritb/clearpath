"""Import independently produced evaluation artifacts, or evaluate a held-out dataset.

No Admin routes. Import defaults to dry-run; --apply is an explicit server operation.
A dataset's labels/provenance must be independently obtained, not OCR approvals.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.algorithms.report_evidence import score_evidence
from backend.services.community.evaluation_ingest import IndependentEvaluation, ingest


def evaluate(rows: list[dict], threshold: float) -> dict:
    if not rows:
        raise ValueError("dataset is empty")
    train = [r for r in rows if r.get("split") == "train"]
    test = [r for r in rows if r.get("split") == "test"]
    if not test:
        raise ValueError("held-out test split required")
    for key in ("subject_group", "device_group", "session_group"):
        if any(not row.get(key) for row in rows):
            raise ValueError("missing independent split group: " + key)
        if {r[key] for r in train} & {r[key] for r in test}:
            raise ValueError("train/test group leakage: " + key)
    outcomes = []
    for row in test:
        if (
            not row.get("label_provenance")
            or type(row.get("expected_evidence_sufficient")) is not bool
        ):
            raise ValueError("independent label and provenance required")
        result = score_evidence(row["report"], row["facts"])
        included = result["score"] >= threshold and not result["blockers"]
        outcomes.append(
            dict(
                expected=row["expected_evidence_sufficient"],
                included=included,
                score=result["score"],
                blockers=result["blockers"],
            )
        )
    n = len(outcomes)
    # Wilson interval describes observed classification agreement, never field accuracy.
    correct = sum(r["expected"] == r["included"] for r in outcomes)
    z = 1.96
    proportion = correct / n
    denominator = 1 + z * z / n
    centre = (proportion + z * z / (2 * n)) / denominator
    margin = (
        z
        * ((proportion * (1 - proportion) / n + z * z / (4 * n * n)) ** 0.5)
        / denominator
    )
    return dict(
        scope="evidence_sufficiency_labels_only_not_sensor_accuracy",
        threshold=threshold,
        held_out_count=n,
        false_inclusions=sum(not r["expected"] and r["included"] for r in outcomes),
        false_exclusions=sum(r["expected"] and not r["included"] for r in outcomes),
        agreement=proportion,
        agreement_wilson_95=[max(0, centre - margin), min(1, centre + margin)],
        outcomes=outcomes,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["import", "evaluate"])
    parser.add_argument("file", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--threshold", type=float, default=70)
    args = parser.parse_args()
    if not 0 <= args.threshold <= 100:
        parser.error("threshold must be 0..100")
    rows = [
        json.loads(line) for line in args.file.read_text().splitlines() if line.strip()
    ]
    if args.operation == "evaluate":
        print(json.dumps(evaluate(rows, args.threshold), ensure_ascii=False, indent=2))
    else:
        validated = [
            IndependentEvaluation.model_validate(r).model_dump(mode="json")
            for r in rows
        ]
        if args.apply:
            for row in validated:
                ingest(row)
        print(
            json.dumps(
                dict(validated=len(validated), applied=args.apply), ensure_ascii=False
            )
        )


if __name__ == "__main__":
    main()
