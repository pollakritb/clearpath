"""Private independent-audit ledger and bounded batched reporter projections."""

import logging
from datetime import UTC, datetime
from threading import RLock
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ...algorithms.reporter_trust import reporter_trust
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db

logger = logging.getLogger("clearpath.reporter_trust")
DEMO_AUDITS: list[dict] = []
DEMO_REVIEWS: dict[tuple[str, str], dict] = {}
_LOCK = RLock()


class ReporterAudit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audit_key: str = Field(min_length=8, max_length=200)
    case_key: str = Field(min_length=8, max_length=200)
    sample_key: str = Field(min_length=8, max_length=200)
    user_id: str
    report_id: str
    revision: int = Field(ge=1, le=10000)
    outcome: Literal["pass", "problem", "unresolved"]
    fault_domain: Literal["reporting", "device", "system", "unknown"]
    evaluator_key: str = Field(min_length=8, max_length=200)
    evidence_ref: str = Field(min_length=10, max_length=2000)
    evaluated_at: datetime

    @model_validator(mode="after")
    def valid_time(self):
        if self.evaluated_at.tzinfo is None or self.evaluated_at > datetime.now(UTC):
            raise ValueError("independent audit needs an aware, nonfuture timestamp")
        self.evaluated_at = self.evaluated_at.astimezone(UTC)
        return self


def ingest(payload: dict) -> dict:
    """Server CLI only. No public/Admin route can write audit outcomes."""
    value = ReporterAudit.model_validate(payload).model_dump(mode="json")
    if not settings.local_demo_mode:
        try:
            return (
                db.get_client()
                .rpc("ingest_reporter_audit", {"p_payload": value})
                .execute()
                .data
            )
        except Exception as exc:
            raise UpstreamError("บันทึกผลตรวจผู้รายงานไม่สำเร็จ") from exc
    with _LOCK:
        report = db.get_community_report(value["report_id"])
        if not report or str(report["user_id"]) != value["user_id"]:
            raise ValueError("audit subject mismatch")
        for existing in DEMO_AUDITS:
            if existing["audit_key"] == value["audit_key"]:
                if existing != value:
                    raise ValueError("audit key conflict")
                return dict(existing)
        cases = [r for r in DEMO_AUDITS if r["case_key"] == value["case_key"]]
        if cases:
            latest = max(cases, key=lambda r: r["revision"])
            if any(
                latest[k] != value[k] for k in ("user_id", "report_id", "sample_key")
            ):
                raise ValueError("audit case identity immutable")
            if (
                value["revision"] != latest["revision"] + 1
                or value["evaluated_at"] < latest["evaluated_at"]
            ):
                raise ValueError("audit revision conflict")
        elif value["revision"] != 1:
            raise ValueError("initial audit revision must be one")
        DEMO_AUDITS.append(value)
        previous_keys = {r["audit_key"] for r in cases}
        for (uid, key), review in DEMO_REVIEWS.items():
            if uid == value["user_id"] and key in previous_keys:
                review["status"] = "reviewed"
        return dict(value)


def enabled() -> bool:
    return settings.local_demo_mode or settings.reporter_trust_enabled


def summaries(user_ids: list[str]) -> dict[str, dict]:
    ids = sorted(set(user_ids))
    if not enabled() or not ids:
        return {}
    validation = (
        "validated" if settings.reporter_trust_validation_ref.strip() else "candidate"
    )
    # Production activation without the independent validation reference fails closed.
    if not settings.local_demo_mode and validation != "validated":
        return {
            uid: {"status": "unavailable", "validation_status": validation}
            for uid in ids
        }
    try:
        rows = []
        if settings.local_demo_mode:
            with _LOCK:
                rows = [dict(r) for r in DEMO_AUDITS if r["user_id"] in ids]
        else:
            from ..measurement.store import pages

            for offset in range(0, len(ids), 100):
                batch = ids[offset : offset + 100]
                rows.extend(
                    pages(
                        lambda batch=batch: (
                            db.get_client()
                            .table("community_reporter_audits")
                            .select("*")
                            .in_("user_id", batch)
                            .order("audit_key")
                        )
                    )
                )
        now = datetime.now(UTC)
        by_user: dict[str, list[dict]] = {uid: [] for uid in ids}
        for row in rows:
            uid = str(row["user_id"])
            if uid in by_user:
                by_user[uid].append(row)
        return {
            uid: reporter_trust(by_user[uid], now=now)
            | {"validation_status": validation}
            for uid in ids
        }
    except Exception:
        logger.warning("reporter_trust_unavailable")
        return {
            uid: {"status": "unavailable", "validation_status": validation}
            for uid in ids
        }


def summary(user_id: str) -> dict | None:
    return summaries([user_id]).get(user_id)


def audit_history(user_id: str, offset: int = 0) -> dict:
    if not enabled():
        return {"audits": [], "next_offset": None}
    try:
        if settings.local_demo_mode:
            with _LOCK:
                rows = sorted(
                    [dict(r) for r in DEMO_AUDITS if r["user_id"] == user_id],
                    key=lambda r: (r["evaluated_at"], r["audit_key"]),
                    reverse=True,
                )[offset : offset + 51]
        else:
            rows = (
                db.get_client()
                .table("community_reporter_audits")
                .select(
                    "audit_key,report_id,revision,outcome,fault_domain,evaluated_at"
                )
                .eq("user_id", user_id)
                .order("evaluated_at", desc=True)
                .order("audit_key")
                .range(offset, offset + 50)
                .execute()
                .data
                or []
            )
        fields = [
            "audit_key",
            "report_id",
            "revision",
            "outcome",
            "fault_domain",
            "evaluated_at",
        ]
        return {
            "audits": [{k: r[k] for k in fields} for r in rows[:50]],
            "next_offset": offset + 50 if len(rows) > 50 else None,
        }
    except Exception as exc:
        raise UpstreamError("โหลดผลตรวจของคุณไม่สำเร็จ") from exc


def request_review(user_id: str, audit_key: str, message: str) -> dict:
    if not enabled():
        raise ValueError("ระบบผลตรวจผู้รายงานยังไม่เปิดใช้งาน")
    if not settings.local_demo_mode:
        try:
            return (
                db.get_client()
                .rpc(
                    "request_reporter_review",
                    {"p_user": user_id, "p_audit": audit_key, "p_message": message},
                )
                .execute()
                .data
            )
        except Exception as exc:
            raise UpstreamError(
                "ส่งคำขอทบทวนไม่สำเร็จ กรุณาโหลดผลตรวจล่าสุดแล้วลองใหม่"
            ) from exc
    with _LOCK:
        row = next(
            (
                r
                for r in DEMO_AUDITS
                if r["audit_key"] == audit_key and r["user_id"] == user_id
            ),
            None,
        )
        if not row:
            raise ValueError("ไม่พบผลตรวจที่เป็นของคุณ")
        if any(
            r["case_key"] == row["case_key"] and r["revision"] > row["revision"]
            for r in DEMO_AUDITS
        ):
            raise ValueError("ผลตรวจมีฉบับใหม่ กรุณาโหลดล่าสุด")
        key = (user_id, audit_key)
        if key not in DEMO_REVIEWS:
            from uuid import uuid4

            DEMO_REVIEWS[key] = {"id": str(uuid4()), "status": "pending"}
        return dict(DEMO_REVIEWS[key])
