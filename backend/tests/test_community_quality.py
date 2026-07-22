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


def test_gap_fill_requires_corroboration_or_calibrated_high_trust():
    common = dict(
        admin_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        near_emission_source=False,
        gps_accuracy_m=30,
    )
    single = evaluate_gap_fill(
        **common, trust_score=77, corroborated_reporters=1, device_calibrated=False
    )
    assert not single["eligible"]
    corroborated = evaluate_gap_fill(
        **common, trust_score=65, corroborated_reporters=2, device_calibrated=False
    )
    assert corroborated == {
        "eligible": True,
        "basis": "corroborated",
        "reason": "มีผู้รายงานอิสระ 2 คนใน 2 กม./1 ชม.",
    }
    calibrated = evaluate_gap_fill(
        **common, trust_score=80, corroborated_reporters=1, device_calibrated=True
    )
    assert calibrated["eligible"]
    assert calibrated["basis"] == "calibrated_high_trust"


def test_direct_emission_or_bad_gps_never_changes_surface():
    blocked = evaluate_gap_fill(
        admin_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        trust_score=95,
        corroborated_reporters=3,
        device_calibrated=True,
        near_emission_source=True,
        gps_accuracy_m=20,
    )
    assert not blocked["eligible"]


def test_perceptual_duplicate_never_changes_surface():
    blocked = evaluate_gap_fill(
        admin_verified=True,
        report_fresh=True,
        data_role="gap_fill",
        trust_score=100,
        corroborated_reporters=4,
        device_calibrated=True,
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
