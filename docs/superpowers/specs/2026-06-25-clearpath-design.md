# ClearPath — Design Spec

> วางแผนการเดินทางเพื่อลดการสัมผัสฝุ่น PM2.5
> Final Year Project · Computer Science · Verified & Research-based
> สถานะ: อนุมัติแล้ว (2026-06-25)

## 1. Problem & Scope

**ปัญหา:** "คนไม่รู้ว่าควรออกบ้านไหม ไปทางไหน เวลาไหน ถึงจะรับฝุ่น PM2.5 น้อยที่สุด"

**3 Core Features**
1. ค้นหา/ปักหมุดปลายทาง + แสดง PM2.5 real-time (Data Fusion)
2. เปรียบเทียบ 2 เส้นทาง → แนะนำเส้นที่รับฝุ่นน้อยกว่า (IDW Spatial Interpolation + Route Scoring)
3. แจ้งเตือนด้วยเสียงภาษาไทย (Web Speech API — accessibility)

**Extras (ใน scope, จัดเป็น phase หลัง core):** OpenWeatherMap, NASA FIRMS fire layer, Kriging upgrade, กราฟประวัติ PM2.5

## 2. Decisions (locked)

| เรื่อง | สิ่งที่เลือก | เหตุผล |
|---|---|---|
| Architecture | **Next.js (frontend) + FastAPI (backend) ใน Vercel project เดียว** | แยก FE/BE ชัด, deploy เดียว, same-origin = ไม่มี CORS |
| Python boundary | FastAPI เป็น backend เต็มตัว (owns external APIs + DB + algorithms) | เล่าใน report ได้สวย, แยกหน้าที่ชัด |
| Database | Supabase (Postgres) ตั้งแต่แรก | source of truth, ทนเวลา air4thai ล่ม, เก็บ history |
| Algorithm distance | **Haversine** (ไม่ใช่ Euclidean ตาม blueprint) | 1° lat ≠ 1° lon — haversine แม่นกว่า |
| Waypoint sampling | resample ORS geometry เองทุก ~500m | ORS ไม่ได้คืน "ทุก 500m" ตรงๆ |
| Deploy | Vercel เดียว (FE + Python function) + Vercel Cron | ฟรี, ครบ |

## 3. Architecture

```
┌─────────── Vercel project เดียว (same-origin, no CORS) ──────────┐
│  FRONTEND (Next.js 16)            BACKEND (FastAPI / Python)      │
│  app/ + frontend/                 api/index.py + backend/        │
│  ─ UI, Leaflet map, panels        ─ routers (HTTP boundary)      │
│  ─ เรียก /api/* เท่านั้น    ──▶    ─ services (air4thai, ORS, …)   │
│                                   ─ algorithms (IDW/Kriging)     │
│                                   ─ Supabase access             │
└──────────────────────────────────────────┬──────────────────────┘
                                            │ cron รายชั่วโมง
                          air4thai · ORS · OpenWeatherMap · FIRMS · Nominatim
                                            │
                                       ┌────▼────┐
                                       │ Supabase│ (source of truth)
                                       └─────────┘
```

**Dev:** `next dev` (:3000) rewrite `/api/*` → `uvicorn` (:8000)
**Prod:** Vercel route `/api/*` → Python function (same origin)

## 4. API Contract

| Method · Path | หน้าที่ |
|---|---|
| `GET /api/pm25/current` | สถานี ~80 แห่ง + ค่าล่าสุด (จาก Supabase) |
| `POST /api/route/compare` | geocode → ORS 2 เส้น → resample → IDW score → เปรียบเทียบ |
| `GET /api/weather?lat&lon` | OpenWeatherMap ปัจจุบัน |
| `GET /api/firms` | NASA FIRMS จุดไฟไหม้ (GeoJSON) |
| `GET /api/history?station_id&hours` | ประวัติ PM2.5 ของสถานี |
| `GET /api/cron/sync` | (Vercel Cron, auth Bearer) air4thai → Supabase |

ดู schema จริงใน `backend/models/schemas.py` และ TS ที่ `frontend/types/index.ts`

## 5. Algorithm core (CS contribution)

- `distance.py` — haversine great-circle (km)
- `idw.py` — Inverse Distance Weighting, k-nearest (default 5), power p (default 2)
- `resample.py` — resample polyline ทุก ~500m (cumulative haversine)
- `kriging.py` — PyKrige Ordinary Kriging (upgrade, lazy import, fallback → IDW)
- `score_route()` — คำนวณ avg/max PM2.5 ตลอดเส้นทาง → ใช้จัดอันดับ

Pure functions, ไม่มี I/O → unit-tested ด้วย pytest (`backend/tests/`)

## 6. AQI standard (กรมควบคุมมลพิษ / WHO)

| PM2.5 (µg/m³) | ระดับ | สี |
|---|---|---|
| 0–25 | ดี | เขียว #2ecc71 |
| 26–37 | ปานกลาง | เหลือง #f1c40f |
| 38–50 | กลุ่มเสี่ยงระวัง | ส้ม #e67e22 |
| 51–90 | มีผลต่อสุขภาพ | แดง #e74c3c |
| >90 | อันตราย | ม่วง #8e44ad |

## 7. Data model (Supabase)

- `stations` — id, name_th, name_en, lat, lon, province, **pm25, aqi, color, recorded_at** (denormalized "current"), updated_at
- `pm25_readings` — append-only history (station_id, pm25, aqi, recorded_at) · `UNIQUE(station_id, recorded_at)`

Cron upsert `stations` (ค่าล่าสุด) + insert `pm25_readings` (history)

## 8. Risks & mitigations

1. Vercel Python size (scipy/pykrige) → IDW เบาใน prod, Kriging มี fallback + รันเทียบ offline ได้
2. NASA FIRMS MAP_KEY อนุมัติ 1–2 วัน → สมัครวันแรก
3. ORS 2,000/วัน, Nominatim 1/วินาที → cache + debounce + User-Agent
4. Web Speech ไม่มีเสียงไทยทุกเครื่อง → fallback ข้อความ
5. `/api/*` wiring บน Vercel (rewrite → python function) → verify ตอน deploy แรก (dev ใช้ next rewrite → uvicorn)

## 9. Phases

0. Setup — scaffold, structure, configs, schema ✅
1. Data layer — cron sync, `/api/pm25/current`, แสดงสถานีบนแผนที่
2. Algorithm core — IDW + haversine + resample + tests
3. Route compare — geocode + ORS + `/api/route/compare` + RoutePanel
4. Accessibility — AudioAlert (Web Speech th-TH + fallback)
5. Extras — OpenWeatherMap, FIRMS layer, history chart, Kriging
6. Polish & demo — responsive, error/loading, deploy, demo script
