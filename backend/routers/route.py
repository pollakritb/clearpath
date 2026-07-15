"""POST /api/route/compare — เปรียบเทียบ 2 เส้นทางด้วยค่า PM2.5 เฉลี่ย
   GET  /api/geocode       — ค้นหาพิกัดจากชื่อสถานที่
"""
from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from ..algorithms.idw import route_confidence, score_route
from ..algorithms.kriging import kriging_score_route
from ..algorithms.resample import resample_path
from ..core.aqi import classify_pm25
from ..models.schemas import (
    Coordinate,
    GeocodeResponse,
    GeocodeResult,
    RouteCompareRequest,
    RouteCompareResponse,
    RouteResult,
    SamplePoint,
)
from ..services import nominatim, ors
from ..services.stations import get_current_stations

router = APIRouter()

LABELS = ["เส้นทางหลัก", "เส้นทางเลือก", "เส้นทางที่ 3", "เส้นทางที่ 4"]


async def _resolve(lat, lon, query, role: str) -> Coordinate:
    """คืนพิกัด จากพิกัดตรงๆ หรือ geocode ชื่อสถานที่"""
    if lat is not None and lon is not None:
        return Coordinate(lat=lat, lon=lon, label=query)
    if query:
        results = await nominatim.geocode(query, limit=1)
        if not results:
            raise HTTPException(404, detail=f"หาพิกัด{role}ไม่พบ: {query}")
        r = results[0]
        return Coordinate(lat=r["lat"], lon=r["lon"], label=r["label"])
    raise HTTPException(400, detail=f"ต้องระบุ{role} (พิกัด หรือ ชื่อสถานที่)")


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(q: str = Query(..., min_length=1)):
    results = await nominatim.geocode(q, limit=5)
    return GeocodeResponse(results=[GeocodeResult(**r) for r in results])


@router.post("/route/compare", response_model=RouteCompareResponse)
async def compare_routes(req: RouteCompareRequest):
    start = await _resolve(req.start_lat, req.start_lon, req.start_query, "ต้นทาง")
    end = await _resolve(req.end_lat, req.end_lon, req.end_query, "ปลายทาง")

    raw_routes = await ors.get_routes((start.lat, start.lon), (end.lat, end.lon))
    if not raw_routes:
        raise HTTPException(502, detail="ไม่พบเส้นทางจาก OpenRouteService")

    stations, _source = await get_current_stations()
    station_pts = [
        {"lat": s["lat"], "lon": s["lon"], "pm25": s.get("pm25")} for s in stations
    ]

    method = req.method
    # ตัดสินใจวิธีให้คะแนน "ครั้งเดียวก่อนลูป" (สถานีชุดเดียวกันทุกเส้น)
    # → ทุกเส้นในการเปรียบเทียบใช้วิธีเดียวกันเสมอ (ไม่ปนคะแนนข้ามวิธี)
    # ถ้า Kriging ใช้ไม่ได้ (ไม่ติดตั้ง pykrige / เมทริกซ์ singular) → fallback IDW ทั้งหมด
    use_kriging = False
    if method == "kriging":
        try:
            probe = resample_path(raw_routes[0]["geometry"], step_m=500)
            await run_in_threadpool(kriging_score_route, probe, station_pts)
            use_kriging = True
        except Exception:
            method = "idw"

    results: list[RouteResult] = []
    for i, rt in enumerate(raw_routes):
        waypoints = resample_path(rt["geometry"], step_m=500)
        if use_kriging:
            score = await run_in_threadpool(kriging_score_route, waypoints, station_pts)
        else:
            score = score_route(waypoints, station_pts)

        cls = classify_pm25(score["avg_pm25"])
        conf = route_confidence(waypoints, station_pts)
        results.append(
            RouteResult(
                id=chr(65 + i),
                label=LABELS[i] if i < len(LABELS) else f"เส้นทาง {i + 1}",
                distance_km=round(rt["distance_m"] / 1000.0, 2),
                duration_min=round(rt["duration_s"] / 60.0, 1),
                avg_pm25=score["avg_pm25"],
                max_pm25=score["max_pm25"],
                level=cls["level"],
                color=cls["color"],
                geometry=rt["geometry"],
                samples=[SamplePoint(**s) for s in score["samples"]],
                covered=score.get("covered", True),
                confidence=conf["confidence"],
                confidence_label=conf["label"],
                avg_nearest_km=conf["avg_nearest_km"],
            )
        )

    # เลือกผู้ชนะจาก "เส้นที่ประเมินค่าฝุ่นได้" เท่านั้น
    # (กันเส้นที่ไม่มีสถานีในบริเวณ → avg=0 → ถูกนับว่าสะอาดสุดอย่างผิดๆ)
    covered = [r for r in results if r.covered]
    if not covered:
        best = results[0]
        reason = "ไม่มีสถานีวัดฝุ่นในบริเวณนี้ — ประเมินและเปรียบเทียบค่าฝุ่นไม่ได้"
    else:
        best = min(covered, key=lambda r: r.avg_pm25)
        if len(covered) == 1:
            reason = (
                "ประเมินค่าฝุ่นได้เพียงเส้นทางเดียว (อีกเส้นไม่มีสถานีในบริเวณ)"
                if len(results) > 1
                else "พบเส้นทางเดียวจาก OpenRouteService (ไม่มีทางเลือกให้เปรียบเทียบ)"
            )
        else:
            others = [r for r in covered if r.id != best.id]
            worst = max(others, key=lambda r: r.avg_pm25)
            diff = round(worst.avg_pm25 - best.avg_pm25, 2)
            reason = (
                f"แนะนำ{best.label}: PM2.5 เฉลี่ย {best.avg_pm25} µg/m³ "
                f"ต่ำกว่าอีกเส้นทาง {diff} µg/m³"
            )

    return RouteCompareResponse(
        routes=results,
        recommended_id=best.id,
        reason=reason,
        start=start,
        end=end,
        method=method,
    )
