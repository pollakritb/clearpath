"""Community gratitude/star feedback workflows."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from ...algorithms.distance import haversine_km
from ...algorithms.trust import (
    evaluate_gratitude_eligibility,
    rating_matches_consensus,
    reviewer_weight,
    star_consensus,
    star_rating_direction,
)
from .. import notifications, supabase_client
from .constants import DAILY_REVIEW_REWARD_LIMIT
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
    if rating not in {1, 2, 3, 4, 5}:
        raise ValueError("คะแนนต้องอยู่ระหว่าง 1–5 ดาว")
    distance = haversine_km(
        reviewer_lat,
        reviewer_lon,
        float(report["lat"]),
        float(report["lon"]),
    )
    eligibility = evaluate_gratitude_eligibility(
        report_status=str(report["status"]),
        is_self=str(report["user_id"]) == reviewer_id,
        distance_km=distance,
        gps_accuracy_m=gps_accuracy_m,
        captured_at=str(report["captured_at"]),
    )
    if not eligibility["eligible"]:
        messages = {
            "report_not_approved": "ส่งคำขอบคุณได้เฉพาะข้อมูลที่ผ่านการตรวจแล้ว",
            "self_review": "ไม่สามารถส่งคำขอบคุณให้ข้อมูลของตนเองได้",
            "gps_inaccurate": "GPS คลาดเคลื่อนเกิน 200 เมตร กรุณาขอตำแหน่งใหม่",
            "outside_radius": "ต้องอยู่ภายใน 3 กม. จากจุดรายงานจึงจะส่งคำขอบคุณได้",
            "report_expired": "ข้อมูลนี้หมดช่วงเวลาสำหรับส่งคำขอบคุณแล้ว",
        }
        raise ValueError(messages[str(eligibility["reason_code"])])
    existing = supabase_client.get_report_reviews(report_id)
    if any(str(review.get("reviewer_id")) == reviewer_id for review in existing):
        raise ValueError("คุณส่งคำขอบคุณให้ข้อมูลนี้แล้ว")

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
        title="มีคนขอบคุณข้อมูลของคุณ",
        body=f"ผู้ใช้ใกล้จุดวัดส่งคำขอบคุณพร้อม {rating} ดาวให้รายงานล่าสุด",
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
                    title="คำขอบคุณของคุณช่วยชุมชน",
                    body="ดาวที่คุณให้สอดคล้องกับความเห็นของชุมชน รับเพิ่ม 2 คะแนน",
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
