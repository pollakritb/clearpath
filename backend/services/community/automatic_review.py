"""Orchestrate fail-closed automatic approval for high-confidence evidence."""

from __future__ import annotations

import logging

from ...algorithms.automatic_review import evaluate_automatic_review
from ...algorithms.trust import calculate_trust_score
from ...core.config import settings
from .. import notifications, supabase_client
from .constants import AUTOMATIC_REVIEW_POLICY
from .presenter import present_report

logger = logging.getLogger(__name__)


def try_automatic_approval(
    *,
    report: dict,
    draft: dict,
    claimed_pm25: float,
    official_stations: list[dict],
) -> tuple[dict | None, dict]:
    """Return an approved presentation or ``None`` with fallback reasons."""
    decision = evaluate_automatic_review(
        enabled=settings.automatic_review_enabled,
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
    if not decision["approved"]:
        return None, decision

    verified_pm25 = float(decision["verified_pm25"])
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
        verification_method="automatic",
        measurement_environment=report.get("measurement_environment") or "outdoor",
        measurement_stable=bool(report.get("measurement_stable", True)),
        near_emission_source=bool(report.get("near_emission_source")),
        gps_accuracy_m=report.get("gps_accuracy_m"),
        duplicate_detected=bool(report.get("duplicate_of_report_id")),
    )
    checks = {
        "image_clear": True,
        "value_matches_display": True,
        "location_plausible": True,
        "no_screen_recapture_signs": True,
    }
    try:
        updated = supabase_client.moderate_report_transaction(
            str(report["id"]),
            None,
            "approve",
            verified_pm25,
            f"{AUTOMATIC_REVIEW_POLICY}: confidence={float(draft.get('ocr_confidence') or 0):.3f}",
            float(trust["score"]),
            list(trust["reasons"]),
            None,
            checks,
        )
    except Exception:
        logger.exception("Automatic review failed closed for report %s", report["id"])
        return None, {
            "approved": False,
            "verified_pm25": None,
            "reasons": ["ระบบบันทึกผลอัตโนมัติไม่สำเร็จ จึงส่งให้ Admin ตรวจแทน"],
        }

    try:
        notifications.enqueue_user_notification(
            user_id=str(report["user_id"]),
            event_type="report_status",
            title="ระบบตรวจและอนุมัติรายงานแล้ว",
            body="หลักฐานผ่านเกณฑ์อัตโนมัติและเผยแพร่ค่า PM2.5 บนแผนที่แล้ว",
            url="/",
            entity_type="community_report",
            entity_id=str(report["id"]),
            deduplication_key=f"report_status:{report['id']}",
            payload={"status": "approved", "verification_method": "automatic"},
        )
    except Exception:
        # Approval is already committed. Notification delivery is retryable and
        # must never make the API report a false pending state.
        logger.exception(
            "Automatic approval notification failed for report %s", report["id"]
        )

    approved = supabase_client.list_community_reports("approved", 500)
    return (
        present_report(
            updated,
            official_stations=official_stations,
            approved_reports=approved,
            include_exact_location=True,
        ),
        decision,
    )
