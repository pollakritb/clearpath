from backend.services.community import evidence


def test_exact_duplicate_is_identified(monkeypatch):
    monkeypatch.setattr(
        evidence.supabase_client, "get_report_by_image_sha256", lambda _sha: None
    )
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
        evidence.supabase_client, "get_report_by_image_sha256", lambda _sha: None
    )
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


def test_indexed_exact_duplicate_does_not_depend_on_recent_500(monkeypatch):
    monkeypatch.setattr(
        evidence.supabase_client,
        "get_report_by_image_sha256",
        lambda sha: {"id": "ancient", "image_sha256": sha},
    )
    monkeypatch.setattr(
        evidence.supabase_client,
        "get_recent_image_fingerprints",
        lambda _limit: (_ for _ in ()).throw(
            AssertionError("must short-circuit before similarity scan")
        ),
    )
    row, exact, distance = evidence.find_duplicate({"sha256": "old", "ahash": "00"})
    assert (row["id"], exact, distance) == ("ancient", True, 0)
