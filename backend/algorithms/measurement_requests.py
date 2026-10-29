"""Pure scheduling, proximity and evidence rules for community measurement requests."""

from datetime import UTC, datetime, timedelta

from .distance import haversine_km


def timestamp(value: str | datetime) -> datetime:
    date = (
        value
        if isinstance(value, datetime)
        else datetime.fromisoformat(value.replace("Z", "+00:00"))
    )
    if date.tzinfo is None:
        raise ValueError("ต้องระบุเขตเวลา")
    return date.astimezone(UTC)


def request_window(
    now: datetime, needed_by: datetime | None
) -> tuple[datetime, datetime]:
    now = timestamp(now)
    if needed_by is None:
        return now, now + timedelta(hours=1)
    end = timestamp(needed_by)
    if end <= now or end > now + timedelta(hours=24):
        raise ValueError("เลือกเวลาล่วงหน้าภายใน 24 ชั่วโมง")
    return max(now, end - timedelta(minutes=30)), end


def in_radius(request: dict, lat: float, lon: float) -> bool:
    return (
        haversine_km(float(request["lat"]), float(request["lon"]), lat, lon)
        <= float(request["radius_km"]) + 1e-9
    )


def eligible_helper(request: dict, presence: dict) -> bool:
    return bool(
        presence.get("enabled")
        and presence.get("user_id") != request["user_id"]
        and presence.get("lat") is not None
        and presence.get("lon") is not None
        and presence.get("observed_at")
        and presence.get("accuracy_m") is not None
        and 0 <= float(presence["accuracy_m"]) <= 200
        and in_radius(request, float(presence["lat"]), float(presence["lon"]))
    )


def qualifying_report(request: dict, report: dict) -> bool:
    if (
        report.get("status") != "approved"
        or report.get("user_id") == request["user_id"]
    ):
        return False
    value = report.get("pm25")
    if value is None or not 0 <= float(value) <= 1000:
        return False
    try:
        start, end = timestamp(request["starts_at"]), timestamp(request["expires_at"])
        return (
            start <= timestamp(report["captured_at"]) <= end
            and start <= timestamp(report["created_at"]) <= end
            and timestamp(report["moderated_at"]) <= end
            and in_radius(request, float(report["lat"]), float(report["lon"]))
        )
    except (KeyError, TypeError, ValueError):
        return False
