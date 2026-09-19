"""Finalize every community submission with an automatic decision."""

from __future__ import annotations

import logging

from ...algorithms.automatic_review import evaluate_automatic_review
from ...algorithms.trust import calculate_trust_score
from ...core.config import settings
from .. import notifications, supabase_client
from .constants import AUTOMATIC_REVIEW_POLICY
from .presenter import present_report

logger = logging.getLogger(__name__)


def _automatic_rejection_reason(
    draft: dict, claimed_pm25: float, maximum_gps_accuracy_m: float
) -> str:
    """Map machine-check failures to a stable, user-safe reason code."""
    if draft.get("duplicate_of_report_id"):
        return "duplicate"
    if (
        draft.get("clock_warning")
        or float(draft.get("gps_accuracy_m") or 0) > maximum_gps_accuracy_m
    ):
        return "invalid_location"
    ocr_pm25 = draft.get("ocr_pm25")
    if ocr_pm25 is not None:
        tolerance = max(
            3.0, min(15.0, max(abs(float(ocr_pm25)), abs(claimed_pm25)) * 0.10)
        )
        if abs(float(ocr_pm25) - claimed_pm25) > tolerance:
            return "value_mismatch"
    if not draft.get("device_detected") or not draft.get("display_clear"):
        return "image_unclear"
    return "invalid_measurement"


def finalize_automatic_review(
    *,
    report: dict,
    draft: dict,
    claimed_pm25: float,
    official_stations: list[dict],
) -> tuple[dict, dict]:
    """Approve or reject immediately; never route evidence to an admin queue."""
    decision = evaluate_automatic_review(
        # Community submissions no longer have a human moderation fallback.
        # The product workflow therefore always runs this deterministic policy.
        enabled=True,
        ocr_pm25=draft.get("ocr_pm25"),
        ocr_confidence=float(draft.get("ocr_confidence") or 0),
        device_detected=bool(draft.get("device_detected")),
        display_clear=bool(draft.get("display_clear")),
        claimed_pm25=claimed_pm25,
        duplicate_detected=bool(draft.get("duplicate_of_report_id")),
        clock_warning=bool(draft.get("clock_warning")),
        gps_accuracy_m=float(draft.get("gps_accuracy_m") or 0),
        burst_frame_count=len(draft.get("burst_hashes") or []),
        minimum_confidence=settings.automatic_review_min_confidence,
        maximum_gps_accuracy_m=settings.automatic_review_max_gps_accuracy_m,
    )
    approved = bool(decision["approved"])
    verified_pm25 = float(decision["verified_pm25"]) if approved else None
    profile = supabase_client.get_profile(str(report["user_id"]))
    trust = calculate_trust_score(
        lat=float(report["lat"]),
        lon=float(report["lon"]),
        pm25=verified_pm25,
        captured_at=str(report["captured_at"]),
        capture_source=str(report.get("capture_source") or "camera"),
        capture_verified=report.get("capture_source") == "camera",
        ocr_pm25=draft.get("ocr_pm25"),
        ocr_confidence=float(draft.get("ocr_confidence") or 0),
        device_detected=bool(draft.get("device_detected")),
        display_clear=bool(draft.get("display_clear")),
        official_stations=official_stations,
        reporter_reputation=int(profile.get("reputation_score") or 0),
        verification_method="automatic" if approved else "rejected",
        measurement_environment=report.get("measurement_environment") or "outdoor",
        measurement_stable=bool(report.get("measurement_stable", True)),
        near_emission_source=bool(report.get("near_emission_source")),
        gps_accuracy_m=report.get("gps_accuracy_m"),
        duplicate_detected=bool(report.get("duplicate_of_report_id")),
    )
    ocr_pm25 = draft.get("ocr_pm25")
    reading_matches = False
    if ocr_pm25 is not None:
        tolerance = max(
            3.0,
            min(15.0, max(abs(float(ocr_pm25)), abs(claimed_pm25)) * 0.10),
        )
        reading_matches = abs(float(ocr_pm25) - claimed_pm25) <= tolerance
    checks = {
        **(report.get("moderation_checks") or {}),
        "image_clear": bool(draft.get("display_clear")),
        "value_matches_display": reading_matches,
        "location_plausible": not bool(draft.get("clock_warning"))
        and float(draft.get("gps_accuracy_m") or 0)
        <= settings.automatic_review_max_gps_accuracy_m,
        "no_screen_recapture_signs": not bool(draft.get("unexpected_exif")),
    }
    rejection_reason = (
        None
        if approved
        else _automatic_rejection_reason(
            draft,
            claimed_pm25,
            settings.automatic_review_max_gps_accuracy_m,
        )
    )
    outcome = "approve" if approved else "reject"
    reason_summary = "; ".join(str(reason) for reason in decision["reasons"])
    updated = supabase_client.moderate_report_transaction(
        str(report["id"]),
        None,
        outcome,
        verified_pm25,
        (
            f"{AUTOMATIC_REVIEW_POLICY}: "
            f"confidence={float(draft.get('ocr_confidence') or 0):.3f}; "
            f"result={outcome}; reasons={reason_summary}"
        )[:500],
        float(trust["score"]),
        list(trust["reasons"]),
        rejection_reason,
        checks,
    )

    try:
        notifications.enqueue_user_notification(
            user_id=str(report["user_id"]),
            event_type="report_status",
            title=("ระบบตรวจและเผยแพร่รายงานแล้ว" if approved else "ระบบตรวจรายงานแล้ว"),
            body=(
                "หลักฐานผ่านเกณฑ์อัตโนมัติและเผยแพร่ค่า PM2.5 บนแผนที่แล้ว"
                if approved
                else "หลักฐานไม่ผ่านเกณฑ์อัตโนมัติ กรุณาดูเหตุผลและถ่ายภาพใหม่"
            ),
            url="/",
            entity_type="community_report",
            entity_id=str(report["id"]),
            deduplication_key=f"report_status:{report['id']}",
            payload={
                "status": "approved" if approved else "rejected",
                "verification_method": "automatic",
                "reason_code": rejection_reason,
            },
        )
    except Exception:
        # The final decision is already committed. Notification delivery is
        # retryable and must never make the API report a false pending state.
        logger.exception(
            "Automatic result notification failed for report %s", report["id"]
        )

    approved_reports = supabase_client.list_community_reports("approved", 500)
    return (
        present_report(
            updated,
            official_stations=official_stations,
            approved_reports=approved_reports,
            include_exact_location=True,
        ),
        decision,
    )
