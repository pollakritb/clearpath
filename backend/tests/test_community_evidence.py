from backend.services.community import evidence


def test_exact_duplicate_is_identified(monkeypatch):
    monkeypatch.setattr(
        evidence.supabase_client,
        "get_recent_image_fingerprints",
        lambda _limit: [{"id": "exact", "image_sha256": "same", "image_ahash": "00"}],
    )

    duplicate, exact, distance = evidence.find_duplicate(
        {"sha256": "same", "ahash": "ff"}
    )

    assert duplicate["id"] == "exact"
    assert exact is True
    assert distance == 0


def test_nearest_perceptual_duplicate_is_identified(monkeypatch):
    monkeypatch.setattr(
        evidence.supabase_client,
        "get_recent_image_fingerprints",
        lambda _limit: [
            {"id": "far", "image_sha256": "a", "image_ahash": "0f"},
            {"id": "near", "image_sha256": "b", "image_ahash": "01"},
        ],
    )

    duplicate, exact, distance = evidence.find_duplicate(
        {"sha256": "new", "ahash": "00"}
    )

    assert duplicate["id"] == "near"
    assert exact is False
    assert distance == 1
