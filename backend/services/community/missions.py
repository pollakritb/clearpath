"""Automatic published coverage tasks; no browser/admin award controls."""

from datetime import UTC, datetime, timedelta
from threading import RLock
from uuid import uuid4

from ...algorithms.community_xp import stamp
from ...algorithms.coverage_missions import missing_coverage
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db
from . import policy_v2, policy_v3

_LOCK = RLock()
_LAST_CHECK: datetime | None = None
# Preannounced public area centres. Never derive tasks from a private home point.
CENTRES = (
    (13.819, 100.040, "ตัวเมืองนครปฐม"),
    (14.023, 99.976, "กำแพงแสน"),
    (13.727, 100.216, "สามพราน"),
)


def refresh() -> int:
    global _LAST_CHECK
    ctl = policy_v3.release()
    if policy_v3.applies(policy=ctl):
        if not ctl.get("missions_enabled") or ctl.get("paused"):
            return 0
    elif not policy_v2.active():
        return 0
    now = datetime.now(UTC)
    with _LOCK:
        if (
            settings.local_demo_mode
            and _LAST_CHECK
            and now - _LAST_CHECK < timedelta(minutes=15)
        ):
            return 0
        try:
            stations = db.get_stations()
            if settings.local_demo_mode:
                reports = db.list_community_reports("approved", 5000)
            else:
                from ..measurement.store import pages

                reports = list(
                    pages(
                        lambda: (
                            db.get_client()
                            .table("community_reports")
                            .select(
                                "id,lat,lon,pm25,status,captured_at,created_at,capture_source,clock_warning,measurement_environment,near_emission_source,duplicate_of_report_id,gps_accuracy_m,evidence_v2,current_evidence_issues"
                            )
                            .eq("status", "approved")
                            .gte("captured_at", (now - timedelta(hours=1)).isoformat())
                            .order("id")
                        )
                    )
                )
            candidates = [
                dict(
                    area_key=f"np:{lat}:{lon}",
                    place_name=name,
                    lat=lat,
                    lon=lon,
                    starts_at=now.isoformat(),
                    expires_at=(now + timedelta(minutes=60)).isoformat(),
                    inputs={
                        "coverage_policy": "coverage-v3"
                        if policy_v3.applies()
                        else "coverage-v2",
                        "checked_at": now.isoformat(),
                        "station_count": len(stations),
                        "report_count": len(reports),
                    },
                )
                for lat, lon, name in CENTRES
                if missing_coverage(
                    lat,
                    lon,
                    stations,
                    reports,
                    now,
                    station_radius_km=2 if policy_v3.applies() else 5,
                    require_evidence_v2=not policy_v3.applies(),
                )
            ]
            if not settings.local_demo_mode:
                return (
                    db.get_client()
                    .rpc("publish_community_missions", {"p_candidates": candidates})
                    .execute()
                    .data
                    or 0
                )
            for row in policy_v2.DEMO_MISSIONS.values():
                if row["state"] == "open" and stamp(row["expires_at"]) <= now:
                    row["state"] = "expired"
            created = 0
            for row in candidates:
                if any(
                    m["area_key"] == row["area_key"] and m["state"] == "open"
                    for m in policy_v2.DEMO_MISSIONS.values()
                ):
                    continue
                key = str(uuid4())
                policy_v2.DEMO_MISSIONS[key] = row | dict(
                    id=key,
                    radius_km=2,
                    state="open",
                    policy_version="contribution-v3"
                    if policy_v3.applies()
                    else "contribution-v2",
                )
                created += 1
            _LAST_CHECK = now
            return created
        except Exception as exc:
            raise UpstreamError("ตรวจพื้นที่ภารกิจไม่สำเร็จ") from exc


def available() -> list[dict]:
    ctl = policy_v3.release()
    v3_active = policy_v3.applies(policy=ctl)
    if v3_active:
        if not ctl.get("missions_enabled") or ctl.get("paused"):
            return []
    elif not policy_v2.active():
        return []
    now = datetime.now(UTC).isoformat()
    version = "contribution-v3" if v3_active else "contribution-v2"
    if settings.local_demo_mode:
        rows = [
            m
            for m in policy_v2.DEMO_MISSIONS.values()
            if m["state"] == "open"
            and m["expires_at"] > now
            and m.get("policy_version", "contribution-v2") == version
        ]
    else:
        try:
            rows = (
                db.get_client()
                .table("community_coverage_missions")
                .select("id,place_name,lat,lon,radius_km,starts_at,expires_at")
                .eq("state", "open")
                .eq("policy_version", version)
                .gt("expires_at", now)
                .order("starts_at")
                .limit(50)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            raise UpstreamError("โหลดภารกิจไม่สำเร็จ") from exc
    keys = ("id", "place_name", "lat", "lon", "radius_km", "starts_at", "expires_at")
    return [{k: row[k] for k in keys} | {"potential_points": 5} for row in rows]


def demo_match(report: dict, metadata: dict) -> dict | None:
    """Called under the XP worker lock; completion committed with its award."""
    from ...algorithms.community_xp import help_eligibility
    from ...algorithms.distance import haversine_km

    if policy_v3.applies(report) and not policy_v3.release().get("missions_enabled"):
        return None
    extraction = metadata.get("evidence_extraction") or {}
    if not policy_v3.applies(report) and (
        extraction.get("pm25_field_verified") is not True
        or extraction.get("unit_verified") is not True
    ):
        return None
    captured, submitted = stamp(report["captured_at"]), stamp(report["created_at"])
    if (
        report.get("measurement_environment") != "outdoor"
        or report.get("near_emission_source")
        or report.get("clock_warning")
    ):
        return None
    expected_version = (
        "contribution-v3" if policy_v3.applies(report) else "contribution-v2"
    )
    for m in sorted(
        policy_v2.DEMO_MISSIONS.values(), key=lambda row: (row["starts_at"], row["id"])
    ):
        if m.get("policy_version", "contribution-v2") != expected_version:
            continue
        if m["state"] != "open" or not stamp(
            m["starts_at"]
        ) <= captured <= submitted < stamp(m["expires_at"]):
            continue
        request = dict(
            id=m["id"],
            user_id="mission-system",
            status="active",
            starts_at=m["starts_at"],
            expires_at=m["expires_at"],
            lat=m["lat"],
            lon=m["lon"],
            radius_km=2,
        )
        from ...algorithms.contribution_v3 import service_eligibility

        check_service = (
            service_eligibility if policy_v3.applies(report) else help_eligibility
        )
        if check_service(report, request, None, metadata, automatic=True) != "granted":
            continue
        if any(
            prior["state"] == "fulfilled"
            and abs((stamp(prior["fulfilled_at"]) - captured).total_seconds()) < 3600
            and haversine_km(prior["lat"], prior["lon"], report["lat"], report["lon"])
            <= 2
            for prior in policy_v2.DEMO_MISSIONS.values()
        ):
            return None
        return m
    return None
