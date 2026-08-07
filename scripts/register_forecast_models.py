"""Review locally gated artifacts and optionally register them in Supabase."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from backend.algorithms.forecast_model import evaluate_activation_gate
from backend.algorithms.forecast_quality import canonical_sha256
from backend.services.supabase_client import get_client


def candidates(directory: Path, *, environment: str) -> list[dict]:
    rows = []
    for path in sorted(directory.glob("forecast_h*.json")):
        artifact = json.loads(path.read_text(encoding="utf-8"))
        metrics = artifact.get("metrics") or {}
        gate = evaluate_activation_gate(metrics)
        unsigned = {
            key: value for key, value in artifact.items() if key != "artifact_sha256"
        }
        integrity_reasons = []
        if artifact.get("artifact_sha256") != canonical_sha256(unsigned):
            integrity_reasons.append("artifact_checksum_mismatch")
        feature_names = artifact.get("feature_names") or []
        expected_feature_sha = canonical_sha256(
            {
                "version": artifact.get("feature_version"),
                "features": feature_names,
            }
        )
        if artifact.get("feature_schema_sha256") != expected_feature_sha:
            integrity_reasons.append("feature_schema_checksum_mismatch")
        for name in (
            "dataset_manifest_sha256",
            "code_release_sha",
            "model_card",
            "calibration",
        ):
            if not artifact.get(name):
                integrity_reasons.append(f"{name}_missing")
        accepted = bool(gate["active"] and not integrity_reasons)
        rows.append(
            {
                "path": path,
                "artifact": artifact,
                "gate": gate,
                "registry": {
                    "id": str(uuid4()),
                    "model_name": "clearpath-xgboost",
                    "horizon_hours": int(artifact["horizon_hours"]),
                    "version": str(artifact["version"]),
                    "feature_version": str(artifact["feature_version"]),
                    "artifact_path": path.as_posix(),
                    "environment": environment,
                    "artifact_sha256": artifact.get("artifact_sha256"),
                    "feature_schema_sha256": artifact.get("feature_schema_sha256"),
                    "dataset_manifest_sha256": artifact.get("dataset_manifest_sha256"),
                    "model_card_sha256": (artifact.get("model_card") or {}).get(
                        "model_card_sha256"
                    ),
                    "code_release_sha": artifact.get("code_release_sha"),
                    "calibration_version": (artifact.get("calibration") or {}).get(
                        "version"
                    ),
                    "train_start": str(
                        metrics.get("train_start") or datetime.now(UTC).isoformat()
                    ),
                    "train_end": str(
                        metrics.get("train_end") or datetime.now(UTC).isoformat()
                    ),
                    "source_rows": int(metrics.get("source_rows", 0)),
                    "completeness": float(metrics.get("completeness", 0)),
                    "baseline_mae": float(metrics.get("baseline_mae", 0)),
                    "model_mae": float(metrics.get("model_mae", 0)),
                    "baseline_category_accuracy": float(
                        metrics.get("baseline_category_accuracy", 0)
                    ),
                    "model_category_accuracy": float(
                        metrics.get("model_category_accuracy", 0)
                    ),
                    "activation_status": "candidate" if accepted else "rejected",
                    "status_reason": ",".join([*gate["reasons"], *integrity_reasons])
                    or "offline_gate_passed_human_approval_required",
                    "metrics": metrics,
                },
                "integrity_reasons": integrity_reasons,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--directory", type=Path, default=Path("backend/model_artifacts")
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--environment", choices=("staging", "production"), default="staging"
    )
    args = parser.parse_args()
    rows = candidates(args.directory, environment=args.environment)
    summary = [
        {
            "path": str(row["path"]),
            "active_gate": row["gate"]["active"],
            "integrity_reasons": row["integrity_reasons"],
            "registry_status": row["registry"]["activation_status"],
            "reasons": [
                *row["gate"]["reasons"],
                *row["integrity_reasons"],
            ],
        }
        for row in rows
    ]
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.apply:
        client = get_client()
        for row in rows:
            client.table("model_registry").upsert(
                row["registry"],
                on_conflict="model_name,horizon_hours,version,environment",
            ).execute()
    return (
        0
        if rows
        and all(row["gate"]["active"] and not row["integrity_reasons"] for row in rows)
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
