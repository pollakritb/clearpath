"""Two-phase camera evidence workflow: capture/OCR draft, then user confirmation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from ...algorithms.community_quality import obfuscate_coordinates
from ...algorithms.trust import calculate_trust_score, is_nakhon_pathom_area
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import capture, image_fingerprint, ocr, supabase_client
from ..stations import get_current_stations
from .constants import DAILY_REPORT_LIMIT
from .evidence import IMAGE_EXTENSIONS, find_duplicate
from .presenter import present_report

DRAFT_TTL_MINUTES = 15


def _parse_client_time(
    value: str | None, issued_at: datetime, received_at: datetime
) -> tuple[datetime, bool]:
    if not value:
        return received_at, True
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
    except (AttributeError, TypeError, ValueError):
        return received_at, True
    warning = (
        parsed < issued_at - timedelta(seconds=30)
        or abs((received_at - parsed).total_seconds()) > 120
    )
    return (received_at if warning else parsed), warning


async def create_draft(
    *,
    user_id: str,
    lat: float,
    lon: float,
    gps_accuracy_m: float,
    camera_session_token: str,
    client_captured_at: str | None,
    image: bytes,
    content_type: str,
    burst_images: list[tuple[bytes, str]] | None = None,
) -> dict:
    if not is_nakhon_pathom_area(lat, lon):
        raise ValueError("ขณะนี้รับรายงานเฉพาะพื้นที่นครปฐม")
    if gps_accuracy_m > 200:
        raise ValueError("GPS คลาดเคลื่อนเกิน 200 เมตร กรุณาขอตำแหน่งใหม่")

    proof = capture.verify_session(camera_session_token, user_id)
    session = supabase_client.get_capture_session(proof["session_id"])
    if not session:
        raise ValueError("ไม่พบ camera session นี้")
    received_at = datetime.now(UTC)
    issued_at = datetime.fromisoformat(str(session["issued_at"]).replace("Z", "+00:00"))
    effective_time, clock_warning = _parse_client_time(
        client_captured_at, issued_at, received_at
    )
    fingerprint = image_fingerprint.fingerprint_image(image)
    duplicate, exact_duplicate, _distance = find_duplicate(fingerprint)
    if exact_duplicate:
        raise ValueError("ภาพนี้เคยถูกส่งแล้ว กรุณาถ่ายหน้าจอเครื่องวัดใหม่")

    burst_fingerprints = [
        image_fingerprint.fingerprint_image(content)
        for content, _content_type in (burst_images or [])
    ]
    await run_in_threadpool(supabase_client.ensure_profile, user_id)
    try:
        ocr_result = await ocr.read_pm25(image, content_type)
    except UpstreamError:
        ocr_result = {
            "available": False,
            "pm25": None,
            "confidence": 0.0,
            "device_detected": False,
            "display_clear": False,
            "raw_text": "",
        }

    draft_id = str(uuid4())
    image_path = f"drafts/{user_id}/{draft_id}.{IMAGE_EXTENSIONS[content_type]}"
    expires_at = received_at + timedelta(minutes=DRAFT_TTL_MINUTES)
    row = {
        "id": draft_id,
        "user_id": user_id,
        "capture_session_id": proof["session_id"],
        "exact_lat": lat,
        "exact_lon": lon,
        "gps_accuracy_m": gps_accuracy_m,
        "camera_session_issued_at": issued_at.isoformat(),
        "client_captured_at": effective_time.isoformat(),
        "effective_captured_at": effective_time.isoformat(),
        "server_received_at": received_at.isoformat(),
        "clock_warning": clock_warning,
        "image_path": image_path,
        "image_sha256": fingerprint["sha256"],
        "image_ahash": fingerprint["ahash"],
        "burst_hashes": [item["sha256"] for item in burst_fingerprints],
        "duplicate_of_report_id": str(duplicate["id"]) if duplicate else None,
        "ocr_pm25": ocr_result["pm25"],
        "ocr_confidence": ocr_result["confidence"],
        "ocr_raw_text": ocr_result["raw_text"],
        "device_detected": ocr_result["device_detected"],
        "display_clear": ocr_result["display_clear"],
        "expires_at": expires_at.isoformat(),
        "submitted_at": None,
        "created_at": received_at.isoformat(),
    }
    try:
        await run_in_threadpool(
            supabase_client.upload_report_image, image_path, image, content_type
        )
        capture.consume_session(proof["session_id"], user_id)
        saved = await run_in_threadpool(supabase_client.create_report_draft, row)
    except Exception:
        await run_in_threadpool(supabase_client.delete_report_image, image_path)
        raise
    return {
        "id": str(saved["id"]),
        "ocr_pm25": saved.get("ocr_pm25"),
        "ocr_confidence": float(saved.get("ocr_confidence") or 0),
        "ocr_available": bool(ocr_result.get("available")),
        "device_detected": bool(saved.get("device_detected")),
        "display_clear": bool(saved.get("display_clear")),
        "duplicate_detected": bool(saved.get("duplicate_of_report_id")),
        "clock_warning": bool(saved.get("clock_warning")),
        "captured_at": str(saved["effective_captured_at"]),
        "expires_at": str(saved["expires_at"]),
        "image_preview_url": supabase_client.signed_report_image_url(image_path),
    }


async def submit_draft(*, draft_id: str, user_id: str, values: dict) -> dict:
    draft = await run_in_threadpool(supabase_client.get_report_draft, draft_id, user_id)
    if not draft:
        raise KeyError(draft_id)
    if draft.get("submitted_at"):
        raise ValueError("draft นี้ถูกส่งแล้ว")
    expires_at = datetime.fromisoformat(str(draft["expires_at"]).replace("Z", "+00:00"))
    if expires_at < datetime.now(UTC):
        raise ValueError("draft หมดอายุ กรุณาถ่ายภาพใหม่")
    if values.get("measurement_environment") != "outdoor" or not values.get(
        "measurement_stable"
    ):
        raise ValueError("รายงานสาธารณะต้องวัดกลางแจ้งและรอค่าบนเครื่องให้คงที่")
    if int(values.get("measurement_duration_seconds") or 0) < 60:
        raise ValueError("กรุณารอให้เครื่องวัดทำงานอย่างน้อย 60 วินาที")
    if values.get("device_calibrated") and (
        not values.get("device_model") or not values.get("calibrated_at")
    ):
        raise ValueError("เครื่องที่ระบุว่าสอบเทียบแล้วต้องมีรุ่นเครื่องและวันที่สอบเทียบ")
    since = (datetime.now(UTC) - timedelta(hours=24)).isoformat()
    if supabase_client.count_user_reports_since(user_id, since) >= DAILY_REPORT_LIMIT:
        raise ValueError("ส่งรายงานได้ไม่เกิน 6 ครั้งต่อ 24 ชั่วโมง")

    profile = await run_in_threadpool(
        supabase_client.ensure_profile, user_id, values.get("display_name")
    )
    official, _source = await get_current_stations()
    trust = calculate_trust_score(
        lat=float(draft["exact_lat"]),
        lon=float(draft["exact_lon"]),
        pm25=None,
        captured_at=str(draft["effective_captured_at"]),
        capture_source="camera",
        capture_verified=True,
        ocr_pm25=draft.get("ocr_pm25"),
        ocr_confidence=float(draft.get("ocr_confidence") or 0),
        device_detected=bool(draft.get("device_detected")),
        display_clear=bool(draft.get("display_clear")),
        official_stations=official,
        reporter_reputation=int(profile.get("reputation_score") or 0),
        measurement_environment="outdoor",
        measurement_stable=True,
        near_emission_source=bool(values.get("near_emission_source")),
        gps_accuracy_m=float(draft["gps_accuracy_m"]),
        duplicate_detected=bool(draft.get("duplicate_of_report_id")),
    )
    report_id = str(uuid4())
    public_lat, public_lon, _precision = obfuscate_coordinates(
        float(draft["exact_lat"]),
        float(draft["exact_lon"]),
        secret_seed=f"{settings.effective_capture_secret}:{report_id}",
    )
    claimed_pm25 = float(values["user_claimed_pm25"])
    ocr_pm25 = draft.get("ocr_pm25")
    mismatch = ocr_pm25 is not None and abs(float(ocr_pm25) - claimed_pm25) > max(
        5.0, claimed_pm25 * 0.2
    )
    now = datetime.now(UTC)
    report_row = {
        "id": report_id,
        "user_id": user_id,
        "display_name": profile.get("display_name"),
        "lat": draft["exact_lat"],
        "lon": draft["exact_lon"],
        "public_lat": public_lat,
        "public_lon": public_lon,
        "province": "นครปฐม",
        "district": None,
        "subdistrict": None,
        "pm25": None,
        "user_claimed_pm25": claimed_pm25,
        "admin_verified_pm25": None,
        "ocr_pm25": ocr_pm25,
        "ocr_confidence": draft.get("ocr_confidence") or 0,
        "ocr_raw_text": draft.get("ocr_raw_text"),
        "ocr_mismatch": mismatch,
        "device_detected": bool(draft.get("device_detected")),
        "display_clear": bool(draft.get("display_clear")),
        "capture_source": "camera",
        "capture_session_id": draft["capture_session_id"],
        "camera_session_issued_at": draft["camera_session_issued_at"],
        "client_captured_at": draft["client_captured_at"],
        "server_received_at": draft["server_received_at"],
        "clock_warning": bool(draft.get("clock_warning")),
        "captured_at": draft["effective_captured_at"],
        "image_path": draft["image_path"],
        "image_sha256": draft["image_sha256"],
        "image_ahash": draft.get("image_ahash"),
        "burst_hashes": draft.get("burst_hashes") or [],
        "duplicate_of_report_id": draft.get("duplicate_of_report_id"),
        "device_model": (values.get("device_model") or "").strip() or None,
        "device_calibrated": bool(values.get("device_calibrated")),
        "calibrated_at": values.get("calibrated_at"),
        "averaging_period": values.get("averaging_period") or "instant",
        "measurement_duration_seconds": int(
            values.get("measurement_duration_seconds") or 60
        ),
        "measurement_environment": "outdoor",
        "measurement_stable": True,
        "near_emission_source": bool(values.get("near_emission_source")),
        "measurement_note": (values.get("measurement_note") or "").strip()[:300]
        or None,
        "gps_accuracy_m": draft["gps_accuracy_m"],
        "status": "pending",
        "base_trust_score": trust["score"],
        "trust_score": trust["score"],
        "trust_reasons": trust["reasons"],
        "peer_up": 0,
        "peer_down": 0,
        "policy_version": "trust-v2",
        "created_at": now.isoformat(),
    }
    saved = await run_in_threadpool(supabase_client.insert_community_report, report_row)
    evidence = {
        "report_id": report_id,
        "exact_lat": draft["exact_lat"],
        "exact_lon": draft["exact_lon"],
        "gps_accuracy_m": draft["gps_accuracy_m"],
        "capture_session_id": draft["capture_session_id"],
        "camera_session_issued_at": draft["camera_session_issued_at"],
        "client_captured_at": draft["client_captured_at"],
        "server_received_at": draft["server_received_at"],
        "image_path": draft["image_path"],
        "image_sha256": draft["image_sha256"],
        "image_ahash": draft.get("image_ahash"),
        "burst_hashes": draft.get("burst_hashes") or [],
        "ocr_raw_text": draft.get("ocr_raw_text"),
        "retention_until": None,
        "created_at": now.isoformat(),
    }
    try:
        await run_in_threadpool(supabase_client.upsert_report_evidence, evidence)
        await run_in_threadpool(
            supabase_client.update_report_draft,
            draft_id,
            {"submitted_at": now.isoformat()},
        )
    except Exception:
        await run_in_threadpool(supabase_client.delete_community_report, report_id)
        raise
    return present_report(
        saved, official_stations=official, include_exact_location=True
    )


def discard_draft(draft_id: str, user_id: str) -> bool:
    draft = supabase_client.delete_report_draft(draft_id, user_id)
    if not draft:
        return False
    if not draft.get("submitted_at") and draft.get("image_path"):
        supabase_client.delete_report_image(str(draft["image_path"]))
    return True
