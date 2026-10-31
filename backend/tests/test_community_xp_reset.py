import hashlib
import io
import json

import pytest
from cryptography.fernet import Fernet, InvalidToken

from scripts import community_xp_reset as reset


def archive(tmp_path):
    cipher = Fernet(Fernet.generate_key())
    manifest = dict(
        project="production",
        created_at="now",
        fingerprints={t: {"hash": "a" * 32, "n": 0} for t in reset.ALL_TABLES},
        images=[],
        version=1,
    )
    manifest["sha256"] = hashlib.sha256(reset.canonical(manifest)).hexdigest()
    path = tmp_path / "backup.encrypted"
    with path.open("wb") as stream:
        chain = reset.write_record(
            stream,
            cipher,
            {"type": "snapshot", "manifest": manifest, "data": {}},
            "",
            0,
        )
        reset.write_record(
            stream,
            cipher,
            {"type": "complete", "images": 0, "manifest_sha256": manifest["sha256"]},
            chain,
            1,
        )
    return path, cipher, manifest


def test_encrypted_round_trip_and_truncated_archive(tmp_path):
    path, cipher, manifest = archive(tmp_path)
    assert reset.verify(path, cipher) == manifest
    data = path.read_bytes()
    assert b"production" not in data
    path.write_bytes(data.splitlines()[0] + b"\n")
    with pytest.raises(ValueError, match="incomplete"):
        reset.verify(path, cipher)


def test_reordered_and_corrupted_archive_fail_closed(tmp_path):
    path, cipher, _ = archive(tmp_path)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(b"".join(reversed(lines)))
    with pytest.raises(ValueError, match="sequence"):
        reset.verify(path, cipher)
    path.write_bytes(lines[0][:-10] + b"bad\n")
    with pytest.raises(InvalidToken):
        reset.verify(path, cipher)


def test_reset_requires_project_manifest_approval_and_restore_proof(
    tmp_path, monkeypatch
):
    path, cipher, manifest = archive(tmp_path)
    calls = []
    monkeypatch.setattr(reset, "query", lambda *args: calls.append(args))
    with pytest.raises(ValueError, match="approval"):
        reset.reset("production", path, cipher, "deploy", tmp_path / "missing")
    proof = tmp_path / "proof.json"
    proof.write_text(
        json.dumps(
            dict(
                manifest_sha256=manifest["sha256"],
                target_project="production",
                restored=True,
            )
        )
    )
    with pytest.raises(ValueError, match="staging/local"):
        reset.reset(
            "production", path, cipher, f"RESET production {manifest['sha256']}", proof
        )
    assert not calls
    sql = reset.reset_sql(manifest)
    assert "DROP TABLE" not in sql and "TRUNCATE" not in sql
    assert "backup stale" in sql and "reset_manifest" in sql
    assert (
        "delete from public.stations" not in sql
        and "delete from public.forecast" not in sql
    )
    assert "update public.profiles set reputation_score=0" in sql
    assert "notification_outbox" in sql
    stream = io.BytesIO()
    reset.write_record(stream, cipher, {"type": "complete"}, "", 0)
    assert b"complete" not in stream.getvalue()


def test_completed_reset_replay_does_not_pause_new_community_activity(
    tmp_path, monkeypatch
):
    path, cipher, manifest = archive(tmp_path)
    proof = tmp_path / "restore.json"
    proof.write_text(
        json.dumps(
            dict(
                manifest_sha256=manifest["sha256"],
                target_project="staging",
                restored=True,
            )
        )
    )
    calls = []

    def query(_project, sql):
        calls.append(sql)
        return [{"reset_manifest": manifest["sha256"], "maintenance": False}]

    monkeypatch.setattr(reset, "query", query)
    reset.reset(
        "production", path, cipher, f"RESET production {manifest['sha256']}", proof
    )
    assert len(calls) == 1 and calls[0].startswith("select")


def test_backup_pruning_is_project_scoped_and_preserves_fresh_archives(tmp_path):
    from datetime import UTC, datetime, timedelta

    cipher = Fernet(Fernet.generate_key())
    for name, project, days in [
        ("expired", "chosen", -1),
        ("fresh", "chosen", 1),
        ("other", "other", -1),
    ]:
        manifest = dict(
            project=project,
            delete_backup_after=(datetime.now(UTC) + timedelta(days=days)).isoformat(),
            images=[],
        )
        manifest["sha256"] = hashlib.sha256(reset.canonical(manifest)).hexdigest()
        with (tmp_path / f"{name}.cpxp").open("wb") as stream:
            chain = reset.write_record(
                stream,
                cipher,
                {"type": "snapshot", "manifest": manifest, "data": {}},
                "",
                0,
            )
            reset.write_record(
                stream,
                cipher,
                {
                    "type": "complete",
                    "images": 0,
                    "manifest_sha256": manifest["sha256"],
                },
                chain,
                1,
            )
    assert reset.prune_backups(tmp_path, cipher, "chosen") == 1
    assert not (tmp_path / "expired.cpxp").exists()
    assert (tmp_path / "fresh.cpxp").exists() and (tmp_path / "other.cpxp").exists()
    assert reset.prune_backups(tmp_path, cipher, "chosen") == 0
