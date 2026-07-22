"""Turn stored community evidence into privacy-safe API representations."""

from ...algorithms.community_quality import (
    corroboration_count,
    evaluate_gap_fill,
    obfuscate_coordinates,
)
from ...algorithms.distance import haversine_km
from ...algorithms.trust import (
    capture_age_minutes,
    is_report_fresh,
    nearest_official_station,
)
from ...core.config import settings
from .. import supabase_client
from .constants import (
    OFFICIAL_PRIORITY_KM,
    PEER_REVIEW_RADIUS_KM,
    PUBLIC_REPORT_MAX_AGE_MINUTES,
)


def present_report(
    row: dict,
    *,
    official_stations: list[dict] | None = None,
    approved_reports: list[dict] | None = None,
    include_image: bool = True,
    include_exact_location: bool = False,
    include_private_metadata: bool = False,
) -> dict:
    """Build an API report while enforcing publication and location rules."""
    reasons = row.get("trust_reasons") or []
    if isinstance(reasons, str):
        reasons = [reasons]
    official_stations = official_stations or []
    approved_reports = approved_reports or []

    exact_lat = float(row["lat"])
    exact_lon = float(row["lon"])
    nearest, distance = nearest_official_station(
        exact_lat,
        exact_lon,
        official_stations,
        max_age_minutes=90,
    )
    role = (
        "supplementary"
        if distance is not None and distance <= OFFICIAL_PRIORITY_KM
        else "gap_fill"
    )
    captured_at = str(row["captured_at"])
    fresh = is_report_fresh(captured_at, max_age_minutes=PUBLIC_REPORT_MAX_AGE_MINUTES)
    age = capture_age_minutes(captured_at)
    admin_verified = row["status"] == "approved"
    trust_score = float(row.get("trust_score") or 0)
    corroborated = corroboration_count(row, approved_reports) if admin_verified else 0
    gps_accuracy = (
        float(row["gps_accuracy_m"]) if row.get("gps_accuracy_m") is not None else None
    )
    eligibility = evaluate_gap_fill(
        admin_verified=admin_verified,
        report_fresh=fresh,
        data_role=role,
        trust_score=trust_score,
        corroborated_reporters=corroborated,
        device_calibrated=bool(row.get("device_calibrated")),
        near_emission_source=bool(row.get("near_emission_source")),
        gps_accuracy_m=gps_accuracy,
        duplicate_detected=bool(row.get("duplicate_of_report_id")),
    )

    location_precision = 0
    lat, lon = exact_lat, exact_lon
    if not include_exact_location:
        if row.get("public_lat") is not None and row.get("public_lon") is not None:
            lat, lon = float(row["public_lat"]), float(row["public_lon"])
            location_precision = round(
                haversine_km(exact_lat, exact_lon, lat, lon) * 1000
            )
        else:
            lat, lon, location_precision = obfuscate_coordinates(
                exact_lat,
                exact_lon,
                secret_seed=f"{settings.effective_capture_secret}:{row['id']}",
            )

    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "display_name": row.get("display_name"),
        "lat": lat,
        "lon": lon,
        "pm25": float(row["pm25"]) if admin_verified else None,
        "ocr_pm25": row.get("ocr_pm25")
        if include_exact_location or include_private_metadata
        else None,
        "user_claimed_pm25": row.get("user_claimed_pm25")
        if include_exact_location or include_private_metadata
        else None,
        "admin_verified_pm25": row.get("admin_verified_pm25")
        if admin_verified
        else None,
        "ocr_confidence": (
            float(row.get("ocr_confidence") or 0)
            if include_exact_location or include_private_metadata
            else 0
        ),
        "captured_at": captured_at,
        "created_at": str(row["created_at"]),
        "status": row["status"],
        "trust_score": trust_score,
        "trust_reasons": reasons,
        "peer_up": int(row.get("peer_up") or 0),
        "peer_down": int(row.get("peer_down") or 0),
        "image_url": (
            supabase_client.signed_report_image_url(row.get("image_path"))
            if include_image
            else None
        ),
        "admin_verified": admin_verified,
        "data_role": role,
        "nearest_official_distance_km": (
            round(distance, 2) if distance is not None else None
        ),
        "nearest_official_pm25": (
            float(nearest["pm25"])
            if nearest and nearest.get("pm25") is not None
            else None
        ),
        "eligible_for_gap_fill": bool(eligibility["eligible"]),
        "is_fresh": fresh,
        "age_minutes": round(age, 1) if age is not None else None,
        "location_precision_m": location_precision,
        "device_model": row.get("device_model"),
        "device_calibrated": bool(row.get("device_calibrated")),
        "calibrated_at": (
            str(row["calibrated_at"]) if row.get("calibrated_at") else None
        ),
        "measurement_environment": row.get("measurement_environment") or "outdoor",
        "measurement_stable": bool(row.get("measurement_stable", True)),
        "near_emission_source": bool(row.get("near_emission_source")),
        "measurement_note": row.get("measurement_note"),
        "gps_accuracy_m": gps_accuracy if include_exact_location else None,
        "duplicate_detected": bool(row.get("duplicate_of_report_id")),
        "corroboration_count": corroborated,
        "gap_fill_basis": eligibility["basis"],
        "eligibility_reason": eligibility["reason"],
        "official_recorded_at": (
            str(nearest["recorded_at"])
            if nearest and nearest.get("recorded_at")
            else None
        ),
        "averaging_period": row.get("averaging_period") or "instant",
        "measurement_duration_seconds": int(
            row.get("measurement_duration_seconds") or 0
        ),
        "province": row.get("province") or "นครปฐม",
        "district": row.get("district"),
        "subdistrict": row.get("subdistrict"),
        "camera_session_issued_at": str(row["camera_session_issued_at"])
        if (include_exact_location or include_private_metadata)
        and row.get("camera_session_issued_at")
        else None,
        "client_captured_at": str(row["client_captured_at"])
        if (include_exact_location or include_private_metadata)
        and row.get("client_captured_at")
        else None,
        "server_received_at": str(row["server_received_at"])
        if (include_exact_location or include_private_metadata)
        and row.get("server_received_at")
        else None,
        "moderated_at": str(row["moderated_at"]) if row.get("moderated_at") else None,
        "clock_warning": bool(row.get("clock_warning"))
        if include_exact_location or include_private_metadata
        else False,
        "ocr_mismatch": bool(row.get("ocr_mismatch"))
        if include_exact_location or include_private_metadata
        else False,
        "rejection_reason_code": row.get("rejection_reason_code")
        if include_exact_location or include_private_metadata
        else None,
        "moderation_checks": (row.get("moderation_checks") or {})
        if include_exact_location or include_private_metadata
        else {},
        "evidence_purged_at": str(row["evidence_purged_at"])
        if row.get("evidence_purged_at")
        else None,
        "policy_version": str(row.get("policy_version") or "trust-v1"),
        "rating_count": int(row.get("rating_count") or 0),
        "rating_average": float(row["rating_average"])
        if row.get("rating_average") is not None
        else None,
    }


def list_reports(status: str = "approved", limit: int = 200) -> list[dict]:
    official = supabase_client.get_stations()
    rows = supabase_client.list_community_reports(status, limit)
    approved = (
        rows
        if status == "approved"
        else supabase_client.list_community_reports("approved", 500)
    )
    reports = [
        present_report(
            row,
            official_stations=official,
            approved_reports=approved,
            include_image=status != "approved",
            include_exact_location=status != "approved",
        )
        for row in rows
    ]
    if status != "approved":
        return reports
    return [report for report in reports if report["is_fresh"]]


def list_reviewable_reports(
    reviewer_id: str,
    reviewer_lat: float,
    reviewer_lon: float,
    limit: int = 50,
) -> list[dict]:
    official = supabase_client.get_stations()
    rows = supabase_client.list_community_reports("approved", max(limit * 4, 100))
    nearby: list[tuple[float, dict]] = []

    for row in rows:
        if str(row["user_id"]) == reviewer_id:
            continue
        reviews = supabase_client.get_report_reviews(str(row["id"]))
        if any(str(review.get("reviewer_id")) == reviewer_id for review in reviews):
            continue
        distance = haversine_km(
            reviewer_lat,
            reviewer_lon,
            float(row["lat"]),
            float(row["lon"]),
        )
        if distance > PEER_REVIEW_RADIUS_KM:
            continue
        report = present_report(
            row,
            official_stations=official,
            approved_reports=rows,
            include_image=True,
            include_exact_location=False,
        )
        if report["is_fresh"]:
            nearby.append((distance, report))

    nearby.sort(key=lambda item: item[0])
    return [report for _, report in nearby[:limit]]
