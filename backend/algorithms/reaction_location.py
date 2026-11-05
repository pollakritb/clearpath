"""Location eligibility is a referenced product policy, never proof of PM accuracy."""

from datetime import datetime
from math import isfinite

from .community_xp import stamp
from .distance import haversine_km


def reaction_eligibility(
    report: dict,
    fix: dict,
    *,
    now: datetime,
    radius_m: float | None,
    reference: str | None,
) -> str | None:
    if radius_m is None or not reference or not reference.strip():
        return "policy_unvalidated"
    if not isfinite(radius_m) or radius_m <= 0:
        return "policy_unvalidated"
    try:
        values = [float(fix[k]) for k in ("lat", "lon", "accuracy_m")]
        if not all(isfinite(v) for v in values) or not (
            -90 <= values[0] <= 90 and -180 <= values[1] <= 180
        ):
            return "gps_invalid"
        age = (now - stamp(fix["observed_at"])).total_seconds()
        report_age = (now - stamp(report["captured_at"])).total_seconds()
        target_accuracy = report.get("gps_accuracy_m")
        if (
            target_accuracy is None
            or not isfinite(float(target_accuracy))
            or float(target_accuracy) < 0
        ):
            return "report_location_unknown"
        if not 0 <= age <= 60:
            return "gps_expired"
        if not 0 <= report_age <= 10800:
            return "report_expired"
        if values[2] < 0:
            return "gps_invalid"
        target_lat, target_lon = float(report["lat"]), float(report["lon"])
        if not (
            isfinite(target_lat)
            and isfinite(target_lon)
            and -90 <= target_lat <= 90
            and -180 <= target_lon <= 180
        ):
            return "report_location_unknown"
        distance = haversine_km(values[0], values[1], target_lat, target_lon) * 1000
        # Sum of error radii is conservative geometry, not guaranteed joint 95% confidence.
        if distance + values[2] + float(target_accuracy) <= radius_m:
            return None
        if max(0, distance - values[2] - float(target_accuracy)) > radius_m:
            return "outside_area"
        return "gps_uncertain"
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return "gps_invalid"
