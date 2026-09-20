from datetime import UTC, datetime, timedelta

from backend.algorithms.community_quality import (
    corroboration_count,
    evaluate_gap_fill,
    obfuscate_coordinates,
)
from backend.algorithms.distance import haversine_km


def _report(
    report_id: str, user_id: str, lat: float, lon: float, pm25: float, minutes: int = 0
):
    return {
        "id": report_id,
        "user_id": user_id,
        "lat": lat,
        "lon": lon,
        "pm25": pm25,
        "status": "approved",
        "captured_at": (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat(),
    }


def test_corroboration_requires_independent_compatible_reporters():
    target = _report("a", "user-a", 13.82, 100.06, 80)
    compatible = _report("b", "user-b", 13.821, 100.061, 76, 10)
    same_user = _report("c", "user-a", 13.822, 100.06, 79, 5)
    incompatible = _report("d", "user-d", 13.821, 100.061, 20, 5)
    assert (
        corroboration_count(target, [target, compatible, same_user, incompatible]) == 2
    )


def test_corroboration_collapses_shared_device_and_replayed_image_across_accounts():
    target = {
        **_report("a", "user-a", 13.82, 100.06, 80),
        "device_model": "Shared Meter",
        "image_sha256": "image-a",
        "image_ahash": "0000000000000000",
    }
    shared_device = {
        **_report("b", "user-b", 13.8205, 100.0605, 78, 5),
        "device_model": " shared meter ",
        "image_sha256": "image-b",
        "image_ahash": "ffffffffffffffff",
    }
    replayed_image = {
        **_report("c", "user-c", 13.821, 100.061, 79, 8),
        "device_model": "Other Meter",
        "image_sha256": "image-a",
        "image_ahash": "aaaaaaaaaaaaaaaa",
    }
    independent = {
        **_report("d", "user-d", 13.824, 100.064, 77, 10),
        "device_model": "Independent Meter",
        "image_sha256": "image-d",
        "image_ahash": "5555555555555555",
    }

    assert (
        corroboration_count(
            target, [target, shared_device, replayed_image, independent]
        )
        == 2
    )


def test_gap_fill_requires_corroboration():
    common = dict(
        evidence_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        near_emission_source=False,
        gps_accuracy_m=30,
    )
    single = evaluate_gap_fill(**common, trust_score=77, corroborated_reporters=1)
    assert not single["eligible"]
    corroborated = evaluate_gap_fill(**common, trust_score=65, corroborated_reporters=2)
    assert corroborated == {
        "eligible": True,
        "basis": "corroborated",
        "reason": "มีผู้รายงานอิสระ 2 คนใน 2 กม./1 ชม.",
    }
    high_trust_single = evaluate_gap_fill(
        **common, trust_score=100, corroborated_reporters=1
    )
    assert not high_trust_single["eligible"]


def test_gap_fill_trust_boundaries_are_fail_closed():
    common = dict(
        evidence_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        near_emission_source=False,
        gps_accuracy_m=200,
    )
    assert not evaluate_gap_fill(
        **common,
        trust_score=59,
        corroborated_reporters=2,
    )["eligible"]
    assert evaluate_gap_fill(
        **common,
        trust_score=60,
        corroborated_reporters=2,
    )["eligible"]
    assert not evaluate_gap_fill(
        **common,
        trust_score=79,
        corroborated_reporters=1,
    )["eligible"]
    assert not evaluate_gap_fill(
        **common,
        trust_score=80,
        corroborated_reporters=1,
    )["eligible"]


def test_direct_emission_or_bad_gps_never_changes_surface():
    blocked = evaluate_gap_fill(
        evidence_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        trust_score=95,
        corroborated_reporters=3,
        near_emission_source=True,
        gps_accuracy_m=20,
    )
    assert not blocked["eligible"]


def test_perceptual_duplicate_never_changes_surface():
    blocked = evaluate_gap_fill(
        evidence_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        trust_score=100,
        corroborated_reporters=4,
        near_emission_source=False,
        gps_accuracy_m=10,
        duplicate_detected=True,
    )
    assert not blocked["eligible"]
    assert "ภาพคล้าย" in blocked["reason"]


def test_public_coordinates_are_stable_and_offset():
    first = obfuscate_coordinates(13.82, 100.06, secret_seed="secret:report")
    second = obfuscate_coordinates(13.82, 100.06, secret_seed="secret:report")
    assert first == second
    distance = haversine_km(13.82, 100.06, first[0], first[1])
    assert 0.115 <= distance <= 0.255


def test_separate_reports_from_one_exact_point_are_not_publicly_linkable():
    first = obfuscate_coordinates(13.82, 100.06, secret_seed="secret:report-a")
    second = obfuscate_coordinates(13.82, 100.06, secret_seed="secret:report-b")

    assert first[:2] != second[:2]
    assert 120 <= first[2] <= 250
    assert 120 <= second[2] <= 250
