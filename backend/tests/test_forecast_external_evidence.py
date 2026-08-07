import hashlib
import json
from pathlib import Path

from scripts.forecast_external_evidence import evaluate


def test_empty_evidence_fails_closed_for_all_external_tasks(tmp_path):
    migration = tmp_path / "migration.sql"
    migration.write_text("select 1;", encoding="utf-8")
    result = evaluate({"schema_version": 1}, migration)
    assert result["ready"] is False
    assert result["completed_count"] == 0
    assert result["pending_count"] == 30


def test_machine_verifiable_infrastructure_evidence_passes_exact_tasks(tmp_path):
    migration = tmp_path / "migration.sql"
    migration.write_text("select 1;", encoding="utf-8")
    digest = hashlib.sha256(migration.read_bytes()).hexdigest()
    evidence = {
        "schema_version": 1,
        "infrastructure": {
            "staging_project_ref": "staging-project",
            "production_project_ref": "production-project",
            "migration_sha256": digest,
            "migration_guard_destructive": False,
            "staging_migration_applied": True,
            "production_migration_applied": True,
        },
    }
    result = evaluate(evidence, migration)
    assert "FCAST-0101" in result["completed_tasks"]
    assert "FCAST-0102" in result["completed_tasks"]
    assert "FCAST-0103" in result["pending_tasks"]


def test_false_safe_gate_requires_every_case_reviewed_and_settled(tmp_path):
    migration = tmp_path / "migration.sql"
    migration.write_text("select 1;", encoding="utf-8")
    evidence = {
        "schema_version": 1,
        "reviews": {
            "shadow": {
                "false_safe_total": 2,
                "false_safe_reviewed": 1,
                "settled_prediction_count": 100,
            }
        },
    }
    assert "FCAST-1005" in evaluate(evidence, migration)["pending_tasks"]
    evidence["reviews"]["shadow"]["false_safe_reviewed"] = 2
    assert "FCAST-1005" in evaluate(evidence, migration)["completed_tasks"]


def test_partial_evidence_with_missing_numeric_fields_fails_closed(tmp_path):
    migration = tmp_path / "migration.sql"
    migration.write_text("select 1;", encoding="utf-8")
    result = evaluate(
        {
            "schema_version": 1,
            "infrastructure": {"cron_secret_configured": True},
        },
        migration,
    )
    assert "FCAST-0104" in result["pending_tasks"]


def test_example_evidence_is_valid_json():
    data = json.loads(
        Path("docs/runbooks/forecast-external-evidence.example.json").read_text(
            encoding="utf-8"
        )
    )
    assert data["schema_version"] == 1
