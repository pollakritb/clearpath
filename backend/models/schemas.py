"""Pydantic schemas — สัญญา (contract) ระหว่าง backend กับ frontend.
ฝั่ง TS อยู่ที่ frontend/types/index.ts (ต้องตรงกัน)
"""
from typing import Literal, Optional

from pydantic import BaseModel


# ── PM2.5 / stations ───────────────────────────────────────
class Station(BaseModel):
    id: str
    name_th: Optional[str] = None
    name_en: Optional[str] = None
    lat: float
    lon: float
    province: Optional[str] = None
    pm25: Optional[float] = None
    aqi: Optional[int] = None
    color: Optional[str] = None
    level: Optional[str] = None
    recorded_at: Optional[str] = None


class StationsResponse(BaseModel):
    stations: list[Station]
    count: int
    updated_at: Optional[str] = None


# ── Route compare ──────────────────────────────────────────
class Coordinate(BaseModel):
    lat: float
    lon: float
    label: Optional[str] = None


class RouteCompareRequest(BaseModel):
    start_query: Optional[str] = None
    end_query: Optional[str] = None
    start_lat: Optional[float] = None
    start_lon: Optional[float] = None
    end_lat: Optional[float] = None
    end_lon: Optional[float] = None
    method: Literal["idw", "kriging"] = "idw"


class SamplePoint(BaseModel):
    lat: float
    lon: float
    pm25: float


class RouteResult(BaseModel):
    id: str  # "A" / "B" / ...
    label: str
    distance_km: float
    duration_min: float
    avg_pm25: float
    max_pm25: float
    level: Optional[str] = None
    color: Optional[str] = None
    geometry: list[list[float]]  # [[lat, lon], ...] เส้นเต็มสำหรับวาด
    samples: list[SamplePoint]  # จุด resample ที่ให้คะแนนแล้ว
    covered: bool = True  # ประเมินค่าฝุ่นได้ไหม (False = ไม่มีสถานีในบริเวณ)
    # ความเชื่อมั่นของค่าประมาณ (จัดการพื้นที่เซนเซอร์เบาบาง)
    confidence: float = 1.0  # 0..1
    confidence_label: Optional[str] = None  # สูง / ปานกลาง / ต่ำ
    avg_nearest_km: Optional[float] = None  # ระยะเฉลี่ยถึงสถานีใกล้สุด


class RouteCompareResponse(BaseModel):
    routes: list[RouteResult]
    recommended_id: str
    reason: str
    start: Coordinate
    end: Coordinate
    method: str


# ── Weather ────────────────────────────────────────────────
class Weather(BaseModel):
    temp: float
    humidity: float
    wind_speed: float
    wind_deg: float
    description: str
    icon: Optional[str] = None


# ── NASA FIRMS ─────────────────────────────────────────────
class FirePoint(BaseModel):
    lat: float
    lon: float
    frp: Optional[float] = None
    bright: Optional[float] = None
    daynight: Optional[str] = None
    acq_date: Optional[str] = None


class FirmsResponse(BaseModel):
    fires: list[FirePoint]
    count: int


# ── History ────────────────────────────────────────────────
class HistoryPoint(BaseModel):
    recorded_at: str
    pm25: Optional[float] = None
    aqi: Optional[int] = None


class HistoryResponse(BaseModel):
    station_id: str
    points: list[HistoryPoint]


# ── Validation (LOOCV) ─────────────────────────────────────
class LoocvMetrics(BaseModel):
    n: int  # จำนวน fold ที่ใช้คำนวณได้
    mae: Optional[float] = None
    rmse: Optional[float] = None
    me: Optional[float] = None  # bias
    r2: Optional[float] = None
    skill: Optional[float] = None  # skill score เทียบ baseline ค่าเฉลี่ยรวม


class ValidationResponse(BaseModel):
    idw: Optional[LoocvMetrics] = None
    kriging: Optional[LoocvMetrics] = None
    mean: Optional[LoocvMetrics] = None  # baseline: ค่าเฉลี่ยรวม
    nearest: Optional[LoocvMetrics] = None  # baseline: สถานีใกล้สุด (Thiessen)
    station_count: int
    better: Optional[str] = None  # "idw" / "kriging" / "tie" (จาก RMSE)


# ── Geocode ────────────────────────────────────────────────
class GeocodeResult(BaseModel):
    lat: float
    lon: float
    label: str


class GeocodeResponse(BaseModel):
    results: list[GeocodeResult]
