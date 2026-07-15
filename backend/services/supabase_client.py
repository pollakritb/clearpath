"""Supabase (PostgreSQL) — source of truth ของข้อมูลสถานี + ประวัติ

ใช้ service_role key (server only). ฟังก์ชันเป็น sync — เรียกผ่าน run_in_threadpool
ใน router ที่เป็น async
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from supabase import Client, create_client

from ..core.config import settings
from ..core.errors import ConfigurationError

_client: Optional[Client] = None

STATION_COLS = [
    "id", "name_th", "name_en", "lat", "lon", "province",
    "pm25", "aqi", "color", "level", "recorded_at",
]


def get_client() -> Client:
    global _client
    if _client is None:
        if not settings.has_supabase:
            raise ConfigurationError(
                "ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SERVICE_ROLE_KEY)"
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def upsert_stations(stations: list[dict]) -> int:
    """upsert ค่าล่าสุดของแต่ละสถานี (ตาราง stations)"""
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for s in stations:
        if not s.get("id"):
            continue
        row = {c: s.get(c) for c in STATION_COLS}
        row["updated_at"] = now
        rows.append(row)
    if rows:
        get_client().table("stations").upsert(rows).execute()
    return len(rows)


def insert_readings(stations: list[dict]) -> int:
    """append ประวัติรายชั่วโมง (ตาราง pm25_readings) — ข้ามค่าซ้ำด้วย on_conflict"""
    rows = [
        {
            "station_id": s["id"],
            "pm25": s.get("pm25"),
            "aqi": s.get("aqi"),
            "recorded_at": s["recorded_at"],
        }
        for s in stations
        if s.get("id") and s.get("recorded_at") and s.get("pm25") is not None
    ]
    if rows:
        get_client().table("pm25_readings").upsert(
            rows, on_conflict="station_id,recorded_at", ignore_duplicates=True
        ).execute()
    return len(rows)


def get_stations() -> list[dict]:
    res = get_client().table("stations").select("*").execute()
    return res.data or []


def get_history(station_id: str, hours: int = 24) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (
        get_client()
        .table("pm25_readings")
        .select("recorded_at,pm25,aqi")
        .eq("station_id", station_id)
        .gte("recorded_at", cutoff)
        .order("recorded_at")
        .execute()
    )
    return res.data or []
