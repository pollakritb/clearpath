"""Pure selection logic for historical map snapshots."""

from datetime import UTC, datetime, timedelta

from .area import is_thailand


def _as_utc(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def select_map_history_stations(
    stations: list[dict],
    readings: list[dict],
    *,
    target_at: datetime,
    max_age_minutes: int = 90,
) -> list[dict]:
    """Select the newest valid reading at or before ``target_at`` per station."""

    target = _as_utc(target_at)
    if target is None:
        raise ValueError("target_at must be a valid datetime")

    newest: dict[str, tuple[datetime, dict]] = {}
    for reading in readings:
        station_id = str(reading.get("station_id") or "")
        recorded_at = _as_utc(reading.get("recorded_at"))
        if not station_id or recorded_at is None or recorded_at > target:
            continue
        age_minutes = (target - recorded_at).total_seconds() / 60
        if age_minutes > max_age_minutes or reading.get("pm25") is None:
            continue
        previous = newest.get(station_id)
        if previous is None or recorded_at > previous[0]:
            newest[station_id] = (recorded_at, reading)

    snapshot: list[dict] = []
    for station in stations:
        station_id = str(station.get("id") or "")
        selected = newest.get(station_id)
        if selected is None:
            continue
        recorded_at, reading = selected
        age_minutes = (target - recorded_at).total_seconds() / 60
        lat = float(station["lat"])
        lon = float(station["lon"])
        snapshot.append(
            {
                **station,
                "pm25": float(reading["pm25"]),
                "aqi": reading.get("aqi"),
                "color": None,
                "level": None,
                "recorded_at": recorded_at.isoformat(),
                "data_status": "fresh" if age_minutes <= 60 else "delayed",
                "age_minutes": round(age_minutes, 1),
                "eligible_for_surface": True,
                "in_service_area": is_thailand(lat, lon),
                "quality_flags": ["historical_reading"],
            }
        )
    return snapshot


def select_map_history_reports(
    reports: list[dict], *, target_at: datetime, max_age_minutes: float = 180
) -> list[dict]:
    """Approved reports exist only after publication, until measurement expiry.

    The reference is the selected map time, never the current wall clock.
    Expiry is exclusive; malformed publication/capture times fail closed.
    """
    target = _as_utc(target_at)
    if target is None:
        raise ValueError("target_at must be a valid datetime")
    selected = []
    for row in reports:
        captured = _as_utc(row.get("captured_at"))
        created = _as_utc(row.get("created_at"))
        published = (
            _as_utc(row.get("moderated_at")) if row.get("moderated_at") else created
        )
        if (
            row.get("status") != "approved"
            or row.get("pm25") is None
            or captured is None
            or created is None
            or published is None
            or max(captured, created, published) > target
            or target >= captured + timedelta(minutes=max_age_minutes)
        ):
            continue
        selected.append(row)
    return selected
