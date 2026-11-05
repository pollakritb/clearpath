"""Server policy, evidence storage and outcome reads; no public control writes."""

from datetime import UTC, datetime
from time import monotonic

from ...algorithms.report_evidence import history_summary, score_evidence
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db

_CACHE = None
DEMO_EVIDENCE: dict[str, dict] = {}
DEMO_OUTCOMES: list[dict] = []
DEMO_MISSIONS: dict[str, dict] = {}


def release() -> dict:
    global _CACHE
    if not settings.community_v2_enabled:
        return dict(
            active_version="v1",
            launched_at=None,
            evidence_threshold=None,
            reaction_radius_m=None,
            reaction_validation_ref=None,
        )
    if settings.local_demo_mode:
        return dict(
            active_version="v2",
            launched_at=settings.community_v2_demo_launch,
            evidence_threshold=70,
            reaction_radius_m=500,
            reaction_validation_ref="temporary-product-policy:2026-11-05:user-directed",
        )
    if _CACHE and monotonic() - _CACHE[0] < 2:
        return dict(_CACHE[1])
    try:
        rows = (
            db.get_client()
            .table("community_policy_release")
            .select("*")
            .eq("singleton", True)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise ValueError("policy missing")
        _CACHE = (monotonic(), rows[0])
        return dict(rows[0])
    except Exception as exc:
        raise UpstreamError("โหลดนโยบายชุมชนไม่สำเร็จ") from exc


def active() -> bool:
    return release()["active_version"] == "v2"


def build_evidence(report: dict, draft: dict) -> dict:
    # Only explicit extraction facts count. Legacy 'image_clear' approval flags are
    # compatibility placeholders and must never be used as proof of field/units.
    facts = dict(
        pm25_field_verified=(draft.get("image_metadata") or {})
        .get("evidence_extraction", {})
        .get("pm25_field_verified"),
        unit_verified=(draft.get("image_metadata") or {})
        .get("evidence_extraction", {})
        .get("unit_verified"),
        capture_provenance_verified=bool(
            report.get("capture_session_id")
            and draft.get("capture_session_id") == report.get("capture_session_id")
        )
        if report.get("capture_source") == "camera"
        else bool(
            (draft.get("image_metadata") or {}).get("exif_captured_at")
            and (draft.get("image_metadata") or {}).get("exif_gps")
        ),
        location_time_verified=not draft.get("clock_warning", True)
        and report.get("gps_accuracy_m") is not None,
        context_recorded=(draft.get("image_metadata") or {}).get("context_recorded")
        is True,
    )
    return score_evidence(report | {"ocr_pm25": draft.get("ocr_pm25")}, facts)


def save_evidence(report: dict, draft: dict) -> dict:
    value = build_evidence(report, draft)
    if settings.local_demo_mode:
        DEMO_EVIDENCE[str(report["id"])] = value
        from .. import local_store

        local_store.update_report(str(report["id"]), {"evidence_v2": value})
    else:
        db.update_community_report(str(report["id"]), {"evidence_v2": value})
    return value


def outcomes(user_id: str) -> dict:
    if settings.local_demo_mode:
        rows = [row for row in DEMO_OUTCOMES if str(row["user_id"]) == user_id]
    else:
        from ..measurement.store import pages

        rows = list(
            pages(
                lambda: (
                    db.get_client()
                    .table("community_evidence_outcomes")
                    .select("report_id,scope,outcome,evaluated_at")
                    .eq("user_id", user_id)
                    .order("evaluated_at")
                )
            )
        )
    # A report is one independent sample within each scope, not one sample per recheck.
    latest = {}
    for row in sorted(rows, key=lambda r: r.get("evaluated_at", "")):
        latest[(row.get("report_id"), row.get("scope"))] = row
    scopes = {
        scope: history_summary([v for v in latest.values() if v.get("scope") == scope])
        for scope in ("image", "metadata", "field_protocol", "instrument")
    }
    conclusive_reports = {}
    for row in latest.values():
        rid = row.get("report_id")
        if rid is None:
            continue
        old = conclusive_reports.get(rid)
        if (
            old is None
            or row["outcome"] == "problem"
            or (old["outcome"] == "unresolved" and row["outcome"] == "pass")
        ):
            conclusive_reports[rid] = row
    return history_summary(list(conclusive_reports.values())) | {"scopes": scopes}


def counters(user_id: str) -> dict:
    if not settings.local_demo_mode:
        return (
            db.get_client()
            .rpc("community_v2_counters", {"p_user": user_id})
            .execute()
            .data
            or {}
        )
    from ..measurement import registered
    from . import xp

    now = datetime.now(UTC)
    from zoneinfo import ZoneInfo

    local = now.astimezone(ZoneInfo("Asia/Bangkok"))
    monday = local.date().toordinal() - local.weekday()
    own = [
        e
        for e in xp._EVENTS
        if e["user_id"] == user_id
        and e.get("policy_version") == "contribution-v2"
        and e["points"] > 0
        and not any(r.get("reverses") == e["id"] for r in xp._EVENTS)
    ]
    from ...algorithms.community_xp import stamp, thai_day
    from . import seasons

    season = seasons.board("month", 0, user_id)
    return dict(
        month_rank=season["me"]["rank"] if season.get("me") else None,
        month_points=sum(
            e["points"]
            for e in own
            if stamp(e["occurred_at"])
            .astimezone(ZoneInfo("Asia/Bangkok"))
            .strftime("%Y-%m")
            == local.strftime("%Y-%m")
        ),
        week_days=len(
            {
                thai_day(e["occurred_at"])
                for e in own
                if e["kind"] == "report"
                and monday
                <= datetime.fromisoformat(thai_day(e["occurred_at"])).date().toordinal()
                <= monday + 6
            }
        ),
        fulfilled_requests=sum(
            len(ids)
            for rid, ids in registered.MATCHES.items()
            if any(
                e.get("report_id") == rid for e in xp._EVENTS if e["user_id"] == user_id
            )
        ),
        missions_completed=sum(
            m.get("fulfilled_user_id") == user_id for m in DEMO_MISSIONS.values()
        ),
    )
