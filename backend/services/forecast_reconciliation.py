"""Compatibility response for retired persisted model-quality reconciliation."""

from datetime import date


def reconcile_day(quality_date: date | None = None) -> dict:
    return {"status": "retired", "rows": 0, "alert_codes": []}
