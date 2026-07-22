"""Peer-review and administrator moderation workflows."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from ...algorithms.distance import haversine_km
from ...algorithms.trust import (
    calculate_trust_score,
    is_report_fresh,
    rating_matches_consensus,
    reviewer_weight,
    star_consensus,
    star_rating_direction,
)
from .. import notifications, supabase_client
from .constants import (
    DAILY_REVIEW_REWARD_LIMIT,
    PEER_REVIEW_RADIUS_KM,
    PUBLIC_REPORT_MAX_AGE_MINUTES,
)
from .presenter import present_report


def rate_report(
    report_id: str,
    reviewer_id: str,
    rating: int,
    note: str | None,
    reviewer_lat: float,
    reviewer_lon: float,
    gps_accuracy_m: float,
) -> dict:
    report = supabase_client.get_community_report(report_id)
    if not report:
        raise KeyError(report_id)
    if report["status"] != "approved":
        raise ValueError("ให้คะแนนได้เฉพาะรายงานที่ผู้ดูแลอนุมัติแล้ว")
    if str(report["user_id"]) == reviewer_id:
        raise ValueError("ไม่สามารถให้คะแนนรายงานของตนเองได้")
    if rating not in {1, 2, 3, 4, 5}:
        raise ValueError("คะแนนต้องอยู่ระหว่าง 1–5 ดาว")
    if gps_accuracy_m > 200:
        raise ValueError("GPS คลาดเคลื่อนเกิน 200 เมตร กรุณาขอตำแหน่งใหม่")
    distance = haversine_km(
        reviewer_lat,
        reviewer_lon,
        float(report["lat"]),
        float(report["lon"]),
    )
    if distance > PEER_REVIEW_RADIUS_KM:
        raise ValueError("ต้องอยู่ภายใน 3 กม. จากจุดรายงานจึงจะให้คะแนนได้")
    if not is_report_fresh(
        str(report["captured_at"]),
        max_age_minutes=PUBLIC_REPORT_MAX_AGE_MINUTES,
    ):
        raise ValueError("รายงานหมดอายุสำหรับการให้คะแนนแล้ว")
    existing = supabase_client.get_report_reviews(report_id)
    if any(str(review.get("reviewer_id")) == reviewer_id for review in existing):
        raise ValueError("คุณให้คะแนนรายงานนี้แล้ว")

    profile = supabase_client.ensure_profile(reviewer_id)
    direction = star_rating_direction(rating)
    weight = reviewer_weight(int(profile.get("reputation_score") or 0))
    supabase_client.upsert_report_review(
        {
            "report_id": report_id,
            "reviewer_id": reviewer_id,
            "verdict": "confirm" if rating >= 3 else "dispute",
            "reason_code": f"star_{rating}",
            "rating": rating,
            "rating_direction": direction,
            "note": note,
            "weight": weight,
            "reviewer_distance_km": round(distance, 3),
            "gps_accuracy_m": round(gps_accuracy_m, 1),
        }
    )
    reviews = supabase_client.get_report_reviews(report_id)
    consensus = star_consensus(reviews)
    updated = supabase_client.update_community_report(
        report_id,
        {
            "peer_up": sum(
                1 for review in reviews if int(review.get("rating") or 0) >= 4
            ),
            "peer_down": sum(
                1 for review in reviews if 0 < int(review.get("rating") or 0) <= 2
            ),
            "rating_count": consensus["count"],
            "rating_average": consensus["average"] or None,
            "trust_score": max(
                0,
                min(
                    100,
                    float(report.get("base_trust_score") or 0)
                    + consensus["adjustment"],
                ),
            ),
            "policy_version": "trust-v2",
        },
    )
    supabase_client.create_public_map_event(
        {
            "id": str(uuid4()),
            "event_type": "report_updated",
            "entity_id": report_id,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    notifications.enqueue_user_notification(
        user_id=str(report["user_id"]),
        event_type="rating",
        title="มีคนให้คะแนนรายงานของคุณ",
        body=f"รายงานล่าสุดได้รับ {rating} ดาวจากผู้ใช้ที่อยู่ใกล้จุดวัด",
        url="/",
        entity_type="community_report",
        entity_id=report_id,
        deduplication_key=f"rating:{report_id}:{reviewer_id}",
        payload={"rating": rating},
    )
    reward_points = 0
    if consensus["count"] >= 3 and consensus["direction"] != "neutral":
        cutoff = (datetime.now(UTC) - timedelta(hours=24)).isoformat()
        for review in reviews:
            review_rating = int(review.get("rating") or 0)
            if review.get("rewarded_at") or not rating_matches_consensus(
                review_rating, consensus["direction"]
            ):
                continue
            rewarded_user = str(review["reviewer_id"])
            if (
                supabase_client.count_reputation_events_since(
                    rewarded_user, "helpful_review", cutoff
                )
                >= DAILY_REVIEW_REWARD_LIMIT
            ):
                continue
            supabase_client.apply_reputation_event(
                rewarded_user,
                2,
                "helpful_review",
                report_id,
                idempotency_key=f"helpful_review:v2:{report_id}:{rewarded_user}",
            )
            supabase_client.mark_review_rewarded(report_id, rewarded_user)
            if rewarded_user == reviewer_id:
                reward_points = 2
                notifications.enqueue_user_notification(
                    user_id=reviewer_id,
                    event_type="reward",
                    title="ได้รับคะแนนช่วยตรวจข้อมูล",
                    body="คะแนนของคุณตรงกับ consensus ของชุมชน รับเพิ่ม 2 คะแนน",
                    url="/",
                    entity_type="community_report",
                    entity_id=report_id,
                    deduplication_key=f"rating_reward:{report_id}:{reviewer_id}",
                    payload={"points": 2},
                )

    approved = supabase_client.list_community_reports("approved", 500)
    return {
        "report": present_report(
            updated,
            official_stations=supabase_client.get_stations(),
            approved_reports=approved,
            include_exact_location=False,
        ),
        "rating_count": consensus["count"],
        "rating_average": consensus["average"],
        "consensus": consensus["direction"],
        "reward_points": reward_points,
    }


def moderate_report(
    report_id: str,
    admin_id: str,
    decision: str,
    verified_pm25: float | None,
    note: str | None,
    rejection_reason_code: str | None = None,
    checks: dict | None = None,
) -> dict:
    report = supabase_client.get_community_report(report_id)
    if not report:
        raise KeyError(report_id)
    if report["status"] != "pending":
        raise ValueError("รายงานนี้ถูกตรวจสอบแล้ว")
    if decision == "approve" and verified_pm25 is None:
        raise ValueError("กรุณากรอกค่า PM2.5 ที่อ่านจากภาพก่อนอนุมัติ")
    checks = checks or {}
    if decision == "approve" and not all(
        checks.get(key, False)
        for key in (
            "image_clear",
            "value_matches_display",
            "location_plausible",
            "no_screen_recapture_signs",
        )
    ):
        raise ValueError("กรุณาตรวจ checklist ให้ครบก่อนอนุมัติ")
    if decision == "reject" and not rejection_reason_code:
        raise ValueError("กรุณาระบุเหตุผลที่ปฏิเสธ")

    status = "approved" if decision == "approve" else "rejected"
    trust_score = float(report.get("trust_score") or 0)
    trust_reasons = list(report.get("trust_reasons") or [])
    official = supabase_client.get_stations()
    if status == "approved":
        profile = supabase_client.get_profile(str(report["user_id"]))
        trust = calculate_trust_score(
            lat=float(report["lat"]),
            lon=float(report["lon"]),
            pm25=float(verified_pm25),
            captured_at=str(report["captured_at"]),
            capture_source=str(report.get("capture_source") or "camera"),
            capture_verified=report.get("capture_source") == "camera",
            ocr_pm25=report.get("ocr_pm25"),
            ocr_confidence=float(report.get("ocr_confidence") or 0),
            device_detected=bool(report.get("device_detected")),
            display_clear=bool(report.get("display_clear")),
            official_stations=official,
            reporter_reputation=int(profile.get("reputation_score") or 0),
            admin_verified=True,
            measurement_environment=(
                report.get("measurement_environment") or "outdoor"
            ),
            measurement_stable=bool(report.get("measurement_stable", True)),
            near_emission_source=bool(report.get("near_emission_source")),
            gps_accuracy_m=report.get("gps_accuracy_m"),
            duplicate_detected=bool(report.get("duplicate_of_report_id")),
        )
        trust_score = float(trust["score"])
        trust_reasons = list(trust["reasons"])

    updated = supabase_client.moderate_report_transaction(
        report_id,
        admin_id,
        decision,
        float(verified_pm25) if verified_pm25 is not None else None,
        note,
        trust_score,
        trust_reasons,
        rejection_reason_code,
        checks,
    )
    notifications.enqueue_user_notification(
        user_id=str(report["user_id"]),
        event_type="report_status",
        title=("รายงานได้รับการอนุมัติ" if decision == "approve" else "รายงานไม่ผ่านการตรวจ"),
        body=(
            "ข้อมูล PM2.5 ของคุณเผยแพร่บนแผนที่แล้ว"
            if decision == "approve"
            else "เปิดดูเหตุผลและคำแนะนำก่อนส่งรายงานครั้งถัดไป"
        ),
        url="/",
        entity_type="community_report",
        entity_id=report_id,
        deduplication_key=f"report_status:{report_id}",
        payload={"status": status, "reason_code": rejection_reason_code},
    )
    approved = supabase_client.list_community_reports("approved", 500)
    return present_report(
        updated,
        official_stations=official,
        approved_reports=approved,
        include_exact_location=True,
    )
