"""Coverage tasks: deterministic public centres, not users' private addresses."""

from datetime import datetime
from math import isfinite

from .community_xp import stamp
from .distance import haversine_km


def missing_coverage(
    lat: float,
    lon: float,
    stations: list[dict],
    reports: list[dict],
    now: datetime,
    *,
    station_radius_km: float = 5,
    require_evidence_v2: bool = True,
) -> bool:
    for station in stations:
        value = station.get("pm25")
        time = station.get("recorded_at")
        try:
            if (
                isinstance(value, (int, float))
                and isfinite(value)
                and value >= 0
                and 0 <= (now - stamp(time)).total_seconds() <= 3600
                and haversine_km(lat, lon, station["lat"], station["lon"])
                <= station_radius_km
            ):
                return False
        except (KeyError, ValueError, TypeError, AttributeError):
            continue
    for report in reports:
        try:
            evidence_ready = (
                report.get("evidence_v2") is not None
                and not report["evidence_v2"].get("blockers", ["unknown"])
                if require_evidence_v2
                else (
                    report.get("capture_source") in {"camera", "upload", "gallery"}
                    and not report.get("clock_warning")
                    and 0
                    <= (
                        stamp(report["created_at"]) - stamp(report["captured_at"])
                    ).total_seconds()
                    <= 900
                )
            )
            if (
                report.get("status") == "approved"
                and isinstance(report.get("pm25"), (int, float))
                and isfinite(report["pm25"])
                and report["pm25"] >= 0
                and report.get("measurement_environment") == "outdoor"
                and evidence_ready
                and not report.get("near_emission_source")
                and not report.get("current_evidence_issues")
                and not report.get("duplicate_of_report_id")
                and report.get("gps_accuracy_m") is not None
                and 0 <= report["gps_accuracy_m"] <= 200
                and 0 <= (now - stamp(report["captured_at"])).total_seconds() <= 3600
                and haversine_km(lat, lon, report["lat"], report["lon"]) <= 2
            ):
                return False
        except (KeyError, ValueError, TypeError, AttributeError):
            continue
    return True
