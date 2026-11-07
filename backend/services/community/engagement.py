"""Social engagement kept separate from report verification and Trust Score."""

from datetime import UTC, datetime

from ...algorithms.reaction_location import reaction_eligibility
from .. import supabase_client
from ..record_keys import creation_key
from . import community_trust, policy_v2


def _approved_report(report_id: str) -> dict:
    report = supabase_client.get_community_report(report_id)
    if not report:
        raise KeyError(report_id)
    if report.get("status") != "approved":
        raise ValueError("แสดงปฏิกิริยาและความคิดเห็นได้เฉพาะรายงานที่เผยแพร่แล้ว")
    return report


def _present_comment(row: dict, viewer_id: str | None = None) -> dict:
    import hashlib
    import hmac

    from ...core.config import settings
    from . import xp

    identity = xp.public_identity(str(row["user_id"])) if xp.enabled() else {}
    token = hmac.new(
        settings.effective_capture_secret.encode(),
        f"comment:{row.get('legacy_id') or row['id']}".encode(),
        hashlib.sha256,
    ).hexdigest()[:32]
    return {
        "id": str(row["id"]),
        "report_id": str(row["report_id"]),
        "user_id": identity.get("member_id") or token,
        "display_name": identity.get("alias") or "สมาชิก ClearPath",
        "avatar_url": None,
        "body": str(row["body"]),
        "created_at": str(row["created_at"]),
        "is_own": viewer_id is not None and str(row["user_id"]) == viewer_id,
    }


def get_engagement(
    report_id: str, viewer_id: str | None = None, comment_limit: int = 30
) -> dict:
    report = _approved_report(report_id)
    reaction = (
        supabase_client.get_report_reaction(report_id, viewer_id) if viewer_id else None
    )
    comments = supabase_client.list_report_comments(report_id, comment_limit)
    policy = policy_v2.release()
    trust_collecting = community_trust.collecting()
    trust_state = (
        community_trust.rpc(
            "community_trust_viewer_state", {"p_user": viewer_id, "p_report": report_id}
        )
        if trust_collecting and viewer_id
        else {}
    )
    required = trust_collecting or policy["active_version"] == "v2"
    return {
        **trust_state,
        "community_trust_collecting": trust_collecting,
        "location_required": required,
        "location_policy_ready": trust_collecting
        or not required
        or bool(
            policy.get("reaction_radius_m") and policy.get("reaction_validation_ref")
        ),
        "reaction_radius_m": 500
        if trust_collecting
        else policy.get("reaction_radius_m")
        if required
        else None,
        "like_count": int(report.get("like_count") or 0),
        "dislike_count": int(report.get("dislike_count") or 0),
        "comment_count": int(report.get("comment_count") or 0),
        "viewer_reaction": reaction.get("reaction") if reaction else None,
        "comments": [_present_comment(row, viewer_id) for row in comments],
    }


def set_reaction(
    report_id: str,
    user_id: str,
    reaction: str,
    location: dict | None = None,
    reason_code: str | None = None,
    request_key: str | None = None,
    trust_policy_version: str | None = None,
) -> dict:
    report = _approved_report(report_id)
    if str(report["user_id"]) == user_id:
        raise ValueError("ไม่สามารถกดถูกใจหรือไม่ถูกใจรายงานของตนเองได้")
    if reaction not in {"like", "dislike"}:
        raise ValueError("ปฏิกิริยาไม่ถูกต้อง")
    if community_trust.collecting():
        if trust_policy_version != "community-trust-v1":
            raise ValueError("กรุณาอ่านนโยบาย Trust ชุมชนรุ่นใหม่และโหลดหน้ารายงานอีกครั้ง")
        result = community_trust.reaction(
            report, user_id, "set", reaction, reason_code, location, request_key
        )
        current = get_engagement(report_id, user_id)
        return (
            {**current, **result}
            if result.get("trust_exclusion_reason")
            else {
                **result,
                **current,
                "trust_projection_status": result.get("trust_projection_status"),
            }
        )
    policy = policy_v2.release()
    metadata = {}
    if policy["active_version"] == "v2":
        reason = reaction_eligibility(
            report,
            location or {},
            now=datetime.now(UTC),
            radius_m=policy.get("reaction_radius_m"),
            reference=policy.get("reaction_validation_ref"),
        )
        messages = {
            "policy_unvalidated": "ยังไม่เปิดโหวตตามตำแหน่ง: รัศมียังไม่มีผลประเมินรองรับ แสดงความคิดเห็นได้ตามปกติ",
            "gps_invalid": "กรุณาอนุญาตตำแหน่งและขอตำแหน่งใหม่ก่อนโหวต",
            "gps_expired": "ตำแหน่งหมดอายุ กรุณาขอตำแหน่งใหม่",
            "report_expired": "รายงานนี้พ้นช่วงรับการโหวตจากพื้นที่แล้ว",
            "report_location_unknown": "รายงานนี้ไม่มีข้อมูลความคลาดเคลื่อนตำแหน่งเพียงพอ",
            "outside_area": "คุณอยู่นอกพื้นที่รับการโหวตของรายงานนี้",
            "gps_uncertain": "ตำแหน่งยังคลาดเคลื่อนคร่อมขอบเขต กรุณาขอตำแหน่งใหม่ แล้วลองอีกครั้ง",
        }
        if reason:
            raise ValueError(messages[reason])
        allowed = (
            {"useful"}
            if reaction == "like"
            else {"image_unclear", "context_question", "value_question"}
        )
        if reason_code not in allowed:
            raise ValueError("กรุณาเลือกเหตุผลของปฏิกิริยา")
        # Retain the versioned decision policy, never raw voter GPS.
        metadata = {
            "reason_code": reason_code,
            "geofence_policy": "location-v2:" + str(policy["reaction_validation_ref"]),
        }
    now = datetime.now(UTC).isoformat()
    existing = supabase_client.get_report_reaction(report_id, user_id)
    supabase_client.upsert_report_reaction(
        {
            "report_id": report_id,
            "user_id": user_id,
            "reaction": reaction,
            **metadata,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
        }
    )
    return get_engagement(report_id, user_id)


def clear_reaction(
    report_id: str, user_id: str, request_key: str | None = None
) -> dict:
    if community_trust.collecting():
        report = supabase_client.get_community_report(report_id)
        if not report:
            raise KeyError(report_id)
        result = community_trust.reaction(
            report, user_id, "withdraw", None, None, None, request_key
        )
        current = (
            get_engagement(report_id, user_id)
            if report.get("status") == "approved"
            else {}
        )
        return {**current, **result}
    _approved_report(report_id)
    supabase_client.delete_report_reaction(report_id, user_id)
    return get_engagement(report_id, user_id)


def add_comment(
    report_id: str, user_id: str, body: str, display_name: str | None = None
) -> dict:
    _approved_report(report_id)
    cleaned = body.strip()
    if not cleaned:
        raise ValueError("กรุณาพิมพ์ความคิดเห็น")
    if len(cleaned) > 500:
        raise ValueError("ความคิดเห็นยาวได้ไม่เกิน 500 ตัวอักษร")
    supabase_client.ensure_profile(user_id, display_name)
    now = datetime.now(UTC).isoformat()
    saved = supabase_client.create_report_comment(
        {
            "id": creation_key("report_comments"),
            "report_id": report_id,
            "user_id": user_id,
            "body": cleaned,
            "status": "published",
            "created_at": now,
            "updated_at": now,
        }
    )
    profile = supabase_client.get_profile(user_id)
    saved["display_name"] = profile.get("display_name")
    saved["avatar_url"] = profile.get("avatar_url")
    return _present_comment(saved, user_id)


def remove_comment(comment_id: str, user_id: str) -> bool:
    return supabase_client.delete_report_comment(comment_id, user_id)
