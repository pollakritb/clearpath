"""In-memory development store used only when LOCAL_DEMO_MODE=true.

It lets contributors exercise the full UI when a Supabase project is not
available. Production never falls back here implicitly.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock

from ..core.config import settings

_LOCK = RLock()
_STATIONS: dict[str, dict] = {}
_HISTORY: list[dict] = []
_PROFILES: dict[str, dict] = {}
_REPORTS: dict[str, dict] = {}
_REVIEWS: dict[tuple[str, str], dict] = {}
_EVENTS: list[dict] = []
_IMAGES: dict[str, tuple[bytes, str]] = {}
_CAPTURE_SESSIONS: dict[str, dict] = {}
_REPORT_DRAFTS: dict[str, dict] = {}
_REPORT_EVIDENCE: dict[str, dict] = {}
_RATE_WINDOWS: dict[tuple[str, str, int], int] = {}
_SYNC_RUNS: dict[str, dict] = {}
_PUSH_SUBSCRIPTIONS: dict[str, dict] = {}
_NOTIFICATION_PREFERENCES: dict[str, dict] = {}
_ALERT_EVENTS: dict[str, dict] = {}
_USER_NOTIFICATIONS: dict[str, dict] = {}
_NOTIFICATION_OUTBOX: dict[str, dict] = {}
_AUDIT_LOGS: list[dict] = []
_PUBLIC_MAP_EVENTS: list[dict] = []
_WEATHER_OBSERVATIONS: list[dict] = []
_WEATHER_FORECASTS: list[dict] = []
_FIRE_FEATURES: list[dict] = []

_ANNOUNCEMENTS = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "title": "โหมดทดลองในเครื่อง",
        "body": "ข้อมูลชุมชนชุดนี้อยู่ในหน่วยความจำและจะหายเมื่อปิด Backend",
        "kind": "community",
        "area": "นครปฐม",
        "published": True,
        "published_at": datetime.now(UTC).isoformat(),
        "expires_at": None,
    }
]
_ACTIVITIES = [
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "title": "ช่วยเติมข้อมูลตำบลที่ยังไม่มีสถานี",
        "description": "ส่งภาพเครื่องวัดกลางแจ้งที่ผ่านการตรวจจาก Admin",
        "reward_points": 10,
        "starts_at": None,
        "ends_at": None,
        "active": True,
        "created_at": datetime.now(UTC).isoformat(),
    }
]


def _seed_stations() -> None:
    if _STATIONS:
        return
    path = (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "eval"
        / "station_snapshot_20260626T022228Z.csv"
    )
    now = datetime.now(UTC).isoformat()
    with path.open("r", encoding="utf-8", newline="") as handle:
        for raw in csv.DictReader(handle):
            station_id = str(raw["id"])
            pm25 = float(raw["pm25"])
            _STATIONS[station_id] = {
                "id": station_id,
                "name_th": f"สถานี Air4Thai {station_id}",
                "name_en": f"Air4Thai {station_id}",
                "lat": float(raw["lat"]),
                "lon": float(raw["lon"]),
                "province": None,
                "pm25": pm25,
                "aqi": None,
                "color": None,
                "level": None,
                "recorded_at": now,
                "updated_at": now,
            }


def get_stations() -> list[dict]:
    with _LOCK:
        _seed_stations()
        return [dict(row) for row in _STATIONS.values()]


def upsert_stations(rows: list[dict]) -> int:
    with _LOCK:
        for row in rows:
            if row.get("id"):
                _STATIONS[str(row["id"])] = dict(row)
        return len(rows)


def insert_readings(rows: list[dict]) -> int:
    with _LOCK:
        for row in rows:
            if row.get("id") and row.get("recorded_at") and row.get("pm25") is not None:
                _HISTORY.append(
                    {
                        "station_id": str(row["id"]),
                        "pm25": row.get("pm25"),
                        "aqi": row.get("aqi"),
                        "recorded_at": row["recorded_at"],
                    }
                )
        return len(rows)


def get_history(station_id: str, hours: int) -> list[dict]:
    with _LOCK:
        rows = [dict(row) for row in _HISTORY if row["station_id"] == station_id]
        if rows:
            return rows[-hours:]
        _seed_stations()
        station = _STATIONS.get(station_id)
        if not station or station.get("pm25") is None:
            return []
        base = float(station["pm25"])
        now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        return [
            {
                "recorded_at": (now - timedelta(hours=offset)).isoformat(),
                "pm25": round(max(0, base + math.sin(offset / 3) * 2.5), 1),
                "aqi": None,
            }
            for offset in reversed(range(min(hours, 72)))
        ]


def ensure_profile(
    user_id: str, display_name: str | None = None, role: str | None = None
) -> dict:
    with _LOCK:
        if user_id not in _PROFILES:
            _PROFILES[user_id] = {
                "id": user_id,
                "display_name": display_name or f"สมาชิก-{user_id[-6:]}",
                "reputation_score": 0,
                "approved_reports": 0,
                "helpful_reviews": 0,
                "role": role or "user",
                "created_at": datetime.now(UTC).isoformat(),
            }
        elif display_name:
            _PROFILES[user_id]["display_name"] = display_name
        if role:
            _PROFILES[user_id]["role"] = role
        return dict(_PROFILES[user_id])


def get_profile(user_id: str) -> dict:
    return ensure_profile(user_id)


def list_user_ids(limit: int) -> list[str]:
    with _LOCK:
        return list(_PROFILES)[:limit]


def upload_image(path: str, content: bytes, content_type: str) -> None:
    with _LOCK:
        _IMAGES[path] = (content, content_type)


def delete_image(path: str) -> None:
    with _LOCK:
        _IMAGES.pop(path, None)


def create_capture_session(row: dict) -> dict:
    with _LOCK:
        _CAPTURE_SESSIONS[str(row["id"])] = dict(row)
        return dict(row)


def get_capture_session(session_id: str) -> dict | None:
    with _LOCK:
        row = _CAPTURE_SESSIONS.get(session_id)
        return dict(row) if row else None


def consume_capture_session(session_id: str, user_id: str, consumed_at: str) -> bool:
    with _LOCK:
        row = _CAPTURE_SESSIONS.get(session_id)
        if not row or str(row.get("user_id")) != user_id or row.get("consumed_at"):
            return False
        row["consumed_at"] = consumed_at
        return True


def create_report_draft(row: dict) -> dict:
    with _LOCK:
        _REPORT_DRAFTS[str(row["id"])] = dict(row)
        return dict(row)


def get_report_draft(draft_id: str, user_id: str) -> dict | None:
    with _LOCK:
        row = _REPORT_DRAFTS.get(draft_id)
        if not row or str(row.get("user_id")) != user_id:
            return None
        return dict(row)


def update_report_draft(draft_id: str, values: dict) -> dict:
    with _LOCK:
        _REPORT_DRAFTS[draft_id].update(values)
        return dict(_REPORT_DRAFTS[draft_id])


def delete_report_draft(draft_id: str, user_id: str) -> dict | None:
    with _LOCK:
        row = _REPORT_DRAFTS.get(draft_id)
        if not row or str(row.get("user_id")) != user_id:
            return None
        return _REPORT_DRAFTS.pop(draft_id)


def list_expired_report_drafts(now: str, limit: int) -> list[dict]:
    with _LOCK:
        rows = [
            dict(row)
            for row in _REPORT_DRAFTS.values()
            if str(row.get("expires_at", "")) <= now
        ]
        return rows[:limit]


def delete_expired_report_draft(draft_id: str) -> None:
    with _LOCK:
        _REPORT_DRAFTS.pop(draft_id, None)


def upsert_report_evidence(row: dict) -> dict:
    with _LOCK:
        _REPORT_EVIDENCE[str(row["report_id"])] = dict(row)
        return dict(row)


def get_report_evidence(report_id: str) -> dict | None:
    with _LOCK:
        row = _REPORT_EVIDENCE.get(report_id)
        return dict(row) if row else None


def take_rate_limit(
    actor_key: str, action: str, window_seconds: int, limit: int
) -> bool:
    bucket = int(datetime.now(UTC).timestamp()) // window_seconds
    key = (actor_key, action, bucket)
    with _LOCK:
        count = _RATE_WINDOWS.get(key, 0) + 1
        _RATE_WINDOWS[key] = count
        return count <= limit


def create_sync_run(row: dict) -> dict:
    with _LOCK:
        _SYNC_RUNS[str(row["id"])] = dict(row)
        return dict(row)


def create_audit_log(row: dict) -> dict:
    with _LOCK:
        _AUDIT_LOGS.append(dict(row))
        return dict(row)


def create_public_map_event(row: dict) -> dict:
    with _LOCK:
        _PUBLIC_MAP_EVENTS.append(dict(row))
        return dict(row)


def update_sync_run(run_id: str, values: dict) -> dict:
    with _LOCK:
        _SYNC_RUNS[run_id].update(values)
        return dict(_SYNC_RUNS[run_id])


def list_sync_runs(limit: int) -> list[dict]:
    with _LOCK:
        rows = sorted(
            _SYNC_RUNS.values(), key=lambda row: row["started_at"], reverse=True
        )
        return [dict(row) for row in rows[:limit]]


def upsert_push_subscription(row: dict) -> dict:
    with _LOCK:
        _PUSH_SUBSCRIPTIONS[str(row["endpoint"])] = dict(row)
        return dict(row)


def deactivate_push_subscription(endpoint: str, user_id: str | None = None) -> None:
    with _LOCK:
        row = _PUSH_SUBSCRIPTIONS.get(endpoint)
        if row and (user_id is None or str(row.get("user_id")) == user_id):
            row["active"] = False


def list_push_subscriptions(user_id: str | None = None) -> list[dict]:
    with _LOCK:
        return [
            dict(row)
            for row in _PUSH_SUBSCRIPTIONS.values()
            if row.get("active")
            and (user_id is None or str(row.get("user_id")) == user_id)
        ]


def upsert_notification_preferences(user_id: str, values: dict) -> dict:
    with _LOCK:
        row = {"user_id": user_id, **values}
        _NOTIFICATION_PREFERENCES[user_id] = row
        return dict(row)


def get_notification_preferences(user_id: str) -> dict | None:
    with _LOCK:
        row = _NOTIFICATION_PREFERENCES.get(user_id)
        return dict(row) if row else None


def list_notification_preferences() -> list[dict]:
    with _LOCK:
        return [dict(row) for row in _NOTIFICATION_PREFERENCES.values()]


def create_alert_if_new(row: dict) -> dict | None:
    key = str(row["deduplication_key"])
    with _LOCK:
        if key in _ALERT_EVENTS:
            return None
        _ALERT_EVENTS[key] = dict(row)
        return dict(row)


def update_alert_event(event_id: str, values: dict) -> None:
    with _LOCK:
        for row in _ALERT_EVENTS.values():
            if str(row.get("id")) == event_id:
                row.update(values)
                return


def create_user_notification(row: dict) -> dict:
    with _LOCK:
        duplicate = next(
            (
                item
                for item in _USER_NOTIFICATIONS.values()
                if item.get("user_id") == row.get("user_id")
                and item.get("deduplication_key") == row.get("deduplication_key")
            ),
            None,
        )
        if duplicate:
            return dict(duplicate)
        _USER_NOTIFICATIONS[str(row["id"])] = dict(row)
        return dict(row)


def list_user_notifications(user_id: str, limit: int) -> list[dict]:
    with _LOCK:
        rows = [
            dict(row)
            for row in _USER_NOTIFICATIONS.values()
            if str(row.get("user_id")) == user_id
        ]
        rows.sort(key=lambda row: str(row.get("created_at")), reverse=True)
        return rows[:limit]


def mark_notification_read(notification_id: str, user_id: str) -> bool:
    with _LOCK:
        row = _USER_NOTIFICATIONS.get(notification_id)
        if not row or str(row.get("user_id")) != user_id:
            return False
        row["read_at"] = datetime.now(UTC).isoformat()
        return True


def mark_all_notifications_read(user_id: str) -> int:
    count = 0
    with _LOCK:
        for row in _USER_NOTIFICATIONS.values():
            if str(row.get("user_id")) == user_id and not row.get("read_at"):
                row["read_at"] = datetime.now(UTC).isoformat()
                count += 1
    return count


def create_outbox_event(row: dict) -> dict:
    with _LOCK:
        existing = next(
            (
                item
                for item in _NOTIFICATION_OUTBOX.values()
                if item.get("event_key") == row.get("event_key")
            ),
            None,
        )
        if existing:
            return dict(existing)
        _NOTIFICATION_OUTBOX[str(row["id"])] = dict(row)
        return dict(row)


def list_pending_outbox(limit: int) -> list[dict]:
    with _LOCK:
        rows = [
            dict(row)
            for row in _NOTIFICATION_OUTBOX.values()
            if row.get("status", "pending") in {"pending", "failed"}
            and str(row.get("next_attempt_at", "")) <= datetime.now(UTC).isoformat()
        ]
        rows.sort(key=lambda row: str(row.get("created_at", "")))
        return rows[:limit]


def update_outbox_event(event_id: str, values: dict) -> dict:
    with _LOCK:
        _NOTIFICATION_OUTBOX[event_id].update(values)
        return dict(_NOTIFICATION_OUTBOX[event_id])


def notification_outbox_summary() -> dict:
    with _LOCK:
        rows = [dict(row) for row in _NOTIFICATION_OUTBOX.values()]
    counts = {status: 0 for status in ("pending", "processing", "sent", "failed")}
    for row in rows:
        status = str(row.get("status", "pending"))
        counts[status] = counts.get(status, 0) + 1
    waiting = [
        row for row in rows if row.get("status", "pending") in {"pending", "failed"}
    ]
    waiting.sort(key=lambda row: str(row.get("created_at", "")))
    failed = [row for row in rows if row.get("status") == "failed"]
    failed.sort(key=lambda row: str(row.get("updated_at", "")), reverse=True)
    return {
        **counts,
        "oldest_waiting_at": waiting[0].get("created_at") if waiting else None,
        "latest_error": failed[0].get("last_error") if failed else None,
    }


def upsert_weather_observation(row: dict) -> None:
    with _LOCK:
        _WEATHER_OBSERVATIONS.append(dict(row))


def upsert_weather_forecasts(rows: list[dict]) -> None:
    with _LOCK:
        _WEATHER_FORECASTS.extend(dict(row) for row in rows)


def upsert_fire_feature(row: dict) -> None:
    with _LOCK:
        _FIRE_FEATURES.append(dict(row))


def get_latest_forecast_features(station_id: str) -> dict:
    """Return the newest weather/fire inputs for neutral model inference."""
    with _LOCK:
        weather = [
            row for row in _WEATHER_OBSERVATIONS if str(row["station_id"]) == station_id
        ]
        fire = [row for row in _FIRE_FEATURES if str(row["station_id"]) == station_id]
        latest_weather = (
            max(weather, key=lambda row: row["recorded_at"]) if weather else {}
        )
        latest_fire = max(fire, key=lambda row: row["recorded_at"]) if fire else {}
        return {**latest_weather, **latest_fire}


def image_token(path: str) -> str:
    return hmac.new(
        settings.effective_capture_secret.encode("utf-8"),
        path.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def get_image(path: str, token: str) -> tuple[bytes, str] | None:
    if not hmac.compare_digest(image_token(path), token):
        return None
    with _LOCK:
        return _IMAGES.get(path)


def insert_report(row: dict) -> dict:
    with _LOCK:
        _REPORTS[str(row["id"])] = dict(row)
        return dict(row)


def get_report(report_id: str) -> dict | None:
    with _LOCK:
        row = _REPORTS.get(report_id)
        return dict(row) if row else None


def list_reports(status: str, limit: int) -> list[dict]:
    with _LOCK:
        rows = list(_REPORTS.values())
        if status != "all":
            rows = [row for row in rows if row["status"] == status]
        rows.sort(key=lambda row: row["created_at"], reverse=True)
        return [dict(row) for row in rows[:limit]]


def list_user_reports(user_id: str, limit: int) -> list[dict]:
    with _LOCK:
        rows = [
            dict(row) for row in _REPORTS.values() if str(row.get("user_id")) == user_id
        ]
        rows.sort(key=lambda row: row["created_at"], reverse=True)
        return rows[:limit]


def count_user_reports_since(user_id: str, cutoff: str) -> int:
    with _LOCK:
        return sum(
            1
            for row in _REPORTS.values()
            if str(row.get("user_id")) == user_id
            and str(row.get("created_at")) >= cutoff
        )


def update_report(report_id: str, values: dict) -> dict:
    with _LOCK:
        _REPORTS[report_id].update(values)
        return dict(_REPORTS[report_id])


def list_expired_report_evidence(now: str, limit: int) -> list[dict]:
    with _LOCK:
        rows = [
            dict(row)
            for row in _REPORT_EVIDENCE.values()
            if row.get("retention_until")
            and str(row["retention_until"]) <= now
            and not row.get("audit_hold")
            and not row.get("purged_at")
        ]
        return rows[:limit]


def purge_report_evidence(report_id: str, purged_at: str) -> None:
    with _LOCK:
        evidence = _REPORT_EVIDENCE.get(report_id)
        if evidence:
            evidence.update(
                {
                    "exact_lat": None,
                    "exact_lon": None,
                    "gps_accuracy_m": None,
                    "image_path": None,
                    "image_sha256": None,
                    "image_ahash": None,
                    "burst_hashes": [],
                    "ocr_raw_text": None,
                    "purged_at": purged_at,
                }
            )
        report = _REPORTS.get(report_id)
        if report:
            report.update(
                {
                    "lat": report.get("public_lat", report.get("lat")),
                    "lon": report.get("public_lon", report.get("lon")),
                    "gps_accuracy_m": None,
                    "image_path": None,
                    "image_sha256": None,
                    "image_ahash": None,
                    "burst_hashes": [],
                    "ocr_raw_text": None,
                    "evidence_purged_at": purged_at,
                }
            )


def delete_community_report(report_id: str) -> None:
    with _LOCK:
        _REPORTS.pop(report_id, None)
        _REPORT_EVIDENCE.pop(report_id, None)
        for key in [key for key in _REVIEWS if key[0] == report_id]:
            _REVIEWS.pop(key, None)


def upsert_review(row: dict) -> None:
    with _LOCK:
        _REVIEWS[(str(row["report_id"]), str(row["reviewer_id"]))] = dict(row)


def get_reviews(report_id: str) -> list[dict]:
    with _LOCK:
        return [dict(row) for (rid, _), row in _REVIEWS.items() if rid == report_id]


def mark_review_rewarded(report_id: str, reviewer_id: str, rewarded_at: str) -> None:
    with _LOCK:
        row = _REVIEWS.get((report_id, reviewer_id))
        if row:
            row["rewarded_at"] = rewarded_at


def apply_event(user_id: str, points: int, reason: str, report_id: str | None) -> dict:
    with _LOCK:
        profile = ensure_profile(user_id)
        profile["reputation_score"] = max(0, int(profile["reputation_score"]) + points)
        if reason == "report_approved":
            profile["approved_reports"] += 1
        if reason == "helpful_review":
            profile["helpful_reviews"] += 1
        _PROFILES[user_id] = profile
        _EVENTS.append(
            {
                "user_id": user_id,
                "points": points,
                "reason": reason,
                "report_id": report_id,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        return dict(profile)


def count_events_since(user_id: str, reason: str, cutoff: str) -> int:
    with _LOCK:
        return sum(
            1
            for event in _EVENTS
            if event["user_id"] == user_id
            and event["reason"] == reason
            and event["created_at"] >= cutoff
        )


def get_user_weekly_points(user_id: str) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=7)
    with _LOCK:
        return max(
            0,
            sum(
                int(event["points"])
                for event in _EVENTS
                if event["user_id"] == user_id
                and datetime.fromisoformat(event["created_at"]) >= cutoff
            ),
        )


def leaderboard(limit: int, weekly: bool = False) -> list[dict]:
    with _LOCK:
        cutoff = datetime.now(UTC) - timedelta(days=7)
        points: dict[str, int] = {}
        for event in _EVENTS:
            created = datetime.fromisoformat(event["created_at"])
            if created >= cutoff:
                user_id = event["user_id"]
                points[user_id] = points.get(user_id, 0) + int(event["points"])
        rows = [
            {**profile, "weekly_points": max(0, points.get(user_id, 0))}
            for user_id, profile in _PROFILES.items()
        ]
        key = (
            (lambda row: (row["weekly_points"], row["reputation_score"]))
            if weekly
            else (lambda row: row["reputation_score"])
        )
        rows.sort(key=key, reverse=True)
        return [dict(row) for row in rows[:limit]]


def announcements() -> list[dict]:
    return [dict(row) for row in _ANNOUNCEMENTS]


def create_announcement(row: dict) -> dict:
    _ANNOUNCEMENTS.insert(0, dict(row))
    return dict(row)


def update_announcement(announcement_id: str, values: dict) -> dict:
    with _LOCK:
        for row in _ANNOUNCEMENTS:
            if str(row.get("id")) == announcement_id:
                row.update(values)
                return dict(row)
    raise KeyError(announcement_id)


def activities() -> list[dict]:
    return [dict(row) for row in _ACTIVITIES if row.get("active")]


def create_activity(row: dict) -> dict:
    _ACTIVITIES.insert(0, dict(row))
    return dict(row)
