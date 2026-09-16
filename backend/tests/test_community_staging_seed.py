from datetime import UTC, datetime

from scripts.generate_community_staging_seed import build_dataset


def test_staging_seed_is_synthetic_deterministic_and_varied():
    reference = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)
    first = build_dataset(reference)
    second = build_dataset(reference)

    assert first == second
    assert first["environment"] == "staging"
    assert first["synthetic_only"] is True
    assert len(first["profiles"]) == len(first["reports"]) == 8
    assert all(row["test_data"] is True for row in first["profiles"])
    assert all(row["test_data"] is True for row in first["reports"])
    assert {row["trust_score"] for row in first["reports"]} >= {59, 60, 80}
    assert len({row["device_model"] for row in first["reports"]}) == 8
    assert len({(row["lat"], row["lon"]) for row in first["reports"]}) >= 5
    assert {row["status"] for row in first["reports"]} == {"approved", "pending"}
