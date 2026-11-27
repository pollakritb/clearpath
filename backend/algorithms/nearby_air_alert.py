"""Uncapped per-observation alerts; pure distance/freshness and deduplication keys."""

import hashlib
import json
from datetime import datetime

from .nearest_air_alert import (
    ALERT_RADIUS_KM,
    alert_severity,
    level_enabled,
    nearby_sources,
    timestamp,
)

POLICY_VERSION = "nearby-pin-observation-v3"


def alert_sources(
    point: dict | None, candidates: list[dict], preferences: dict, now: datetime
) -> list[dict]:
    return [
        {**source, "policy_version": POLICY_VERSION}
        for source in nearby_sources(point, candidates, ALERT_RADIUS_KM, now)
        if level_enabled(preferences, alert_severity(source["pm25"]))
    ]


def observation_key(source: dict) -> str:
    """Independent of date, recipient GPS and evaluation order; new readings get new keys."""
    identity = [
        source["source_type"],
        str(source["source_id"]),
        timestamp(source["source_at"]).isoformat(),
        float(source["pm25"]),
    ]
    digest = hashlib.sha256(
        json.dumps(identity, separators=(",", ":")).encode()
    ).hexdigest()
    return f"nearby-v3:{digest}"
