"""Private transactional community feedback, projection and operational review boundary."""

from datetime import UTC, datetime
from uuid import UUID

from ...algorithms.community_trust import POLICY, THAI, project
from ...core.config import settings
from ...core.errors import ConfigurationError, UpstreamError
from .. import supabase_client as db
from . import public_images


def rpc(name: str, params: dict | None = None):
    try:
        return db.get_client().rpc(name, params or {}).execute().data
    except Exception as exc:
        raise UpstreamError("อัปเดต Trust ชุมชนไม่สำเร็จ กรุณาลองใหม่โดยใช้คำขอเดิม") from exc


def control() -> dict:
    if (
        not settings.community_trust_collection_enabled
        and not settings.community_trust_public_enabled
    ):
        return {}
    return rpc("community_trust_control") or {}


def collecting() -> bool:
    return settings.community_trust_collection_enabled and bool(
        control().get("collecting_enabled")
    )


def public_enabled() -> bool:
    try:
        return settings.community_trust_public_enabled and bool(
            control().get("public_enabled")
        )
    except UpstreamError:
        return False


def reaction(
    report: dict,
    voter: str,
    action: str,
    reaction: str | None,
    reason: str | None,
    location: dict | None,
    key: str | None,
) -> dict:
    if not key:
        raise ValueError("คำขอนี้ต้องมีรหัสป้องกันการส่งซ้ำ กรุณาโหลดหน้าใหม่")
    try:
        key = str(UUID(key))
    except ValueError as exc:
        raise ValueError("รหัสคำขอไม่ถูกต้อง") from exc
    available = False
    if action == "set":
        try:
            expires = int(datetime.now(UTC).timestamp()) + 60
            available = bool(
                public_images.read(
                    str(report["id"]),
                    expires,
                    public_images.token(str(report["id"]), expires),
                )
            )
        except (KeyError, UpstreamError):
            pass
    result = rpc(
        "community_trust_react",
        {
            "p_user": voter,
            "p_report": str(report["id"]),
            "p_key": key,
            "p_action": action,
            "p_payload": {
                "reaction": reaction,
                "reason_code": reason,
                "location": location,
                "evidence_available": available,
                "policy_version": POLICY,
            },
        },
    )
    # Projection failure must never roll back or duplicate an accepted reaction.
    try:
        result["trust_projection_status"] = summary(str(report["user_id"]), owner=True)[
            "status"
        ]
    except Exception:
        result["trust_projection_status"] = "updating"
    return result


def _public_projection(value: dict) -> dict:
    """Apply the response contract even on stale-cache and failed-write paths."""
    from ...models.community_trust import CommunityTrust

    return CommunityTrust.model_validate(value).model_dump(mode="json")


def summary(
    user: str, *, owner: bool = False, release: dict | None = None
) -> dict | None:
    if not owner and not settings.community_trust_public_enabled:
        return None
    try:
        ctl = release if release is not None else control()
    except UpstreamError:
        return {"policy_version": POLICY, "status": "unavailable"}
    if not (
        owner
        and settings.community_trust_collection_enabled
        and ctl.get("collecting_enabled")
    ) and not (settings.community_trust_public_enabled and ctl.get("public_enabled")):
        return None
    previous = None
    try:
        snapshot = rpc("community_trust_snapshot", {"p_user": user, "p_limit": 0})
        previous = snapshot.get("projection")
        if (
            previous
            and previous.get("_ledger_seq") == snapshot["ledger_seq"]
            and previous.get("window_end")
            == datetime.now(UTC).astimezone(THAI).date().isoformat()
            and previous.get("status") in {"available", "insufficient"}
        ):
            return {
                **{k: v for k, v in previous.items() if not k.startswith("_")},
                "contribution_days_30": snapshot.get("contribution_days_30", 0),
                "review_available": bool(
                    ctl.get("review_owner") and ctl.get("review_channel")
                ),
            }
        cursor = snapshot.get("next_seq")
        while cursor is not None:
            page = rpc(
                "community_trust_snapshot",
                {
                    "p_user": user,
                    "p_after": cursor,
                    "p_limit": 5000,
                    "p_watermark": snapshot["ledger_seq"],
                },
            )
            snapshot["events"].extend(page["events"])
            cursor = page.get("next_seq")
        value = project(snapshot["events"], now=datetime.now(UTC), include_private=True)
        slots = value.pop("_slots")
        value.pop("comparison", None)
        value["contribution_days_30"] = snapshot.get("contribution_days_30", 0)
        value["review_available"] = bool(
            ctl.get("review_owner") and ctl.get("review_channel")
        )
        if (
            previous
            and all(
                previous.get(k) == v for k, v in value.items() if k != "calculated_at"
            )
            and previous.get("_ledger_seq") == snapshot["ledger_seq"]
        ):
            return {k: v for k, v in previous.items() if not k.startswith("_")}
        saved = rpc(
            "community_trust_store_projection",
            {
                "p_user": user,
                "p_seq": snapshot["ledger_seq"],
                "p_payload": {**value, "_ledger_seq": snapshot["ledger_seq"]},
                "p_slots": slots,
            },
        )
        if not saved:
            return _public_projection({**(previous or value), "status": "updating"})
        return value
    except UpstreamError:
        return _public_projection(
            {
                **(previous or {}),
                "policy_version": POLICY,
                "status": "updating" if previous else "unavailable",
            }
        )


def request_review(user: str, payload: dict) -> dict:
    ctl = control()
    if not ctl.get("review_owner") or not ctl.get("review_channel"):
        raise ConfigurationError("ยังไม่มีผู้รับผิดชอบรับคำขอทบทวน Trust ชุมชน")
    result = rpc(
        "community_trust_request_review",
        {
            "p_user": user,
            "p_report": payload.get("report_id"),
            "p_from": payload.get("from_day"),
            "p_to": payload.get("to_day"),
            "p_message": payload["message"],
        },
    )
    return {"id": str(result), "status": "pending"}


def record_finding(user: str, key: str, payload: dict):
    """Server CLI only. Never mounted on Admin or public HTTP routes."""
    return rpc(
        "community_trust_record_finding",
        {"p_user": user, "p_key": str(UUID(key)), "p_payload": payload},
    )


def reconcile(after: int | None = None) -> dict:
    """Bounded, retryable server job; rebuild expired windows and released holds."""
    if not settings.community_trust_collection_enabled:
        return {"skipped": True, "reason": "disabled"}
    release = control()
    if not release.get("collecting_enabled"):
        return {"skipped": True, "reason": "disabled"}
    cursor = rpc("community_trust_cursor") if after is None else after
    ids = rpc("community_trust_subjects", {"p_after": cursor, "p_limit": 100})
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(
            pool.map(lambda uid: summary(str(uid), owner=True, release=release), ids)
        )
    updated = sum(
        bool(outcome) and outcome.get("status") not in {"unavailable", "updating"}
        for outcome in outcomes
    )
    next_cursor = max(ids) if len(ids) == 100 else 0
    if after is None:
        rpc("community_trust_cursor", {"p_after": next_cursor, "p_expected": cursor})
    return {
        "updated": updated,
        "retryable": len(ids) - updated,
        "next_cursor": max(ids) if len(ids) == 100 else None,
    }


def review_queue(limit: int = 50) -> dict:
    if not settings.community_trust_collection_enabled:
        return {"requests": []}
    rows = rpc("community_trust_review_queue", {"p_limit": limit})
    # Reviewer sees request scope and evidence references, never private account keys.
    return {
        "requests": [
            {
                k: r.get(k)
                for k in ("id", "from_day", "to_day", "message", "status", "created_at")
            }
            for r in rows
        ]
    }


def summaries(users: list[str]) -> dict[str, dict]:
    if not settings.community_trust_public_enabled or not users:
        return {}
    from concurrent.futures import ThreadPoolExecutor

    ids = sorted(set(users))
    try:
        ctl = control()
    except UpstreamError:
        return {user: {"status": "unavailable"} for user in ids}
    if not ctl.get("public_enabled"):
        return {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        values = list(pool.map(lambda user: summary(user, release=ctl), ids))
    return {
        user: value
        for user, value in zip(ids, values, strict=True)
        if value is not None
    }
