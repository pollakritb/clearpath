import hashlib
import json
from datetime import UTC, datetime

from scripts.completion_gate import REQUIRED, validate_manifest
from scripts.completion_status import private_json


def test_manifest_never_accepts_simulated_or_missing_evidence(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "scope": "production-readiness",
                "source_commit": "a" * 40,
                "accepted_by": "owner",
                "reporter_trust_prior": [2, 2],
                "evidence": {},
            }
        )
    )
    assert len(validate_manifest(path)) == len(REQUIRED)


def test_manifest_binds_review_to_artifact_hash_and_source_commit(tmp_path):
    artifact = tmp_path / "proof.txt"
    artifact.write_text("test artifact only; not real project validation")
    row = {
        "kind": "real",
        "accepted": True,
        "checked_at": datetime.now(UTC).isoformat(),
        "reviewer": "test-reviewer",
        "artifact": artifact.name,
        "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
    }
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "scope": "production-readiness",
                "source_commit": "a" * 40,
                "accepted_by": "owner",
                "reporter_trust_prior": [2, 2],
                "evidence": {k: row for k in REQUIRED},
            }
        )
    )
    assert validate_manifest(path, expected_commit="a" * 40) == []
    assert "reviewed_source_commit_mismatch" in validate_manifest(
        path, expected_commit="b" * 40
    )
    artifact.write_text("changed")
    assert len(validate_manifest(path)) == len(REQUIRED)


def test_private_baselines_are_not_overwritten(tmp_path):
    path = tmp_path / "private.json"
    private_json(path, {"accounts": []})
    assert path.stat().st_mode & 0o777 == 0o600
    import pytest

    with pytest.raises(FileExistsError):
        private_json(path, {"changed": True})
