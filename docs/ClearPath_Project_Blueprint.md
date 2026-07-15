# ClearPath — Project Blueprint
> วางแผนการเดินทางเพื่อลดการสัมผัสฝุ่น PM2.5  
> Final Year Project | Computer Science | Verified & Research-based

---

## 1. ทิศทางโปรเจกต์

### ปัญหาที่แก้
> "คนไม่รู้ว่าควรออกบ้านไหม ไปทางไหน เวลาไหน ถึงจะรับฝุ่น PM2.5 น้อยที่สุด"

### 3 Core Features (Scope จริงที่จะทำ)

| # | Feature | CS Contribution |
|---|---------|----------------|
| 1 | ค้นหา / ปักหมุดปลายทาง + แสดง PM2.5 Real-time | Data Fusion หลายแหล่ง |
| 2 | เปรียบเทียบ 2 เส้นทาง → แนะนำเส้นทางที่รับฝุ่นน้อยกว่า | IDW Spatial Interpolation + Route Scoring |
| 3 | แจ้งเตือนด้วยเสียง (Accessibility) | Web Speech API สำหรับผู้สูงอายุ / ผู้พิการทางสายตา |

---

## 2. System Workflow

```
[ผู้ใช้] พิมพ์ชื่อสถานที่ หรือ คลิกปักหมุดบนแผนที่
              ↓
[Nominatim OSM] แปลงชื่อ → พิกัด lat/lng (Geocoding)
              ↓
[OpenRouteService] ดึง 2 เส้นทาง (fastest + alternative)
พร้อม waypoints ทุก 500m ตลอดเส้นทาง
              ↓
[air4thai API] ดึง PM2.5 real-time จาก ~80 สถานีทั่วไทย
[OpenWeatherMap] ดึง อุณหภูมิ, ความชื้น, ทิศทางลม
              ↓
[IDW Interpolation Algorithm] คำนวณค่า PM2.5 ประมาณ
ทุก waypoint บนเส้นทาง (จากสถานีใกล้เคียง 3-5 สถานี)
              ↓
[Route Scoring] คำนวณ PM2.5 เฉลี่ยสะสมของแต่ละเส้นทาง
              ↓
[Frontend] แสดงผล:
  - Leaflet Map + Heatmap
  - เปรียบเทียบ 2 เส้นทาง (ค่าฝุ่น / เวลา / ระยะทาง)
  - แสดงสถานะสีตาม AQI standard
  - แนะนำเส้นทางที่ดีกว่า
              ↓
[Web Speech API] อ่านสรุปผลออกเสียงภาษาไทย
```

---

## 3. Architecture Overview

```
clearpath/
├── frontend/                    # Next.js 14 (App Router)
│   ├── app/
│   │   └── page.tsx             # Main map interface
│   ├── components/
│   │   ├── Map.tsx              # Leaflet map + heatmap
│   │   ├── RoutePanel.tsx       # เปรียบเทียบ 2 เส้นทาง
│   │   ├── AQICard.tsx          # แสดง PM2.5 + สภาพอากาศ
│   │   └── AudioAlert.tsx       # Web Speech API
│   └── lib/
│       └── api.ts               # เรียก Backend
│
├── backend/                     # Python FastAPI 0.138.0
│   ├── main.py                  # Entry point
│   ├── routers/
│   │   ├── pm25.py              # /api/pm25/current
│   │   ├── route.py             # /api/route/compare
│   │   └── weather.py           # /api/weather/current
│   ├── services/
│   │   ├── air4thai.py          # ดึงข้อมูลจาก PCD
│   │   ├── openweather.py       # ดึงสภาพอากาศ
│   │   └── ors.py               # OpenRouteService
│   └── algorithms/
│       └── idw.py               # IDW Interpolation core
│
└── database/                    # Supabase (PostgreSQL)
    └── schema.sql               # stations, readings tables
```

---

## 4. Data Sources (Verified ✅)

### 4.1 air4thai — กรมควบคุมมลพิษ
- **สถานะ:** ฟรี ไม่จำกัด ไม่ต้อง API Key
- **อัปเดต:** ทุก 1 ชั่วโมง
- **Coverage:** ~80 สถานีทั่วประเทศไทย

```
# Endpoint หลักที่ใช้
GET http://air4thai.pcd.go.th/services/getNewAQI_JSON.php
→ ดึงสถานีทั้งหมด + ค่า PM2.5 ปัจจุบัน

GET http://air4thai.pcd.go.th/services/getHistoryData.php
    ?stationID={id}&date={YYYY-MM-DD}
→ ข้อมูลย้อนหลังรายวัน
```

**Response ที่ได้:**
```json
{
  "stations": [
    {
      "stationID": "01t",
      "nameTH": "ริมถนนพหลโยธิน",
      "lat": "13.780",
      "long": "100.638",
      "AQILast": {
        "PM25": { "value": "68", "aqi": "151", "color": "orange" }
      }
    }
  ]
}
```

---

### 4.2 OpenWeatherMap
- **สถานะ:** ฟรี ไม่ต้องบัตรเครดิต
- **Free tier:** 1,000 calls/day, 60 calls/min
- **ต้องการ:** API Key (สมัครฟรีที่ openweathermap.org)

```
# Endpoint ที่ใช้
GET https://api.openweathermap.org/data/2.5/weather
    ?lat={lat}&lon={lon}&appid={API_KEY}&units=metric&lang=th

# Response fields ที่ใช้
temperature: data.main.temp
humidity:    data.main.humidity  
wind_speed:  data.wind.speed
wind_deg:    data.wind.deg
description: data.weather[0].description
```

---

### 4.3 NASA FIRMS (Fire Hotspots)
- **สถานะ:** ฟรี ต้องสมัครขอ MAP_KEY ที่ firms.modaps.eosdis.nasa.gov
- **อัปเดต:** ทุก 3-6 ชั่วโมง (Near Real-Time)
- **ใช้ทำ:** Feature เพิ่มใน Heatmap แสดงจุดไฟไหม้ป่า (bonus feature)

```
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/
    {MAP_KEY}/VIIRS_SNPP_NRT/
    {west},{south},{east},{north}/   # Thailand: 97.5,5.5,105.7,20.5
    {days}                           # 1-10 วัน

# Response: CSV
latitude,longitude,bright_ti4,frp,daynight
18.123,99.456,312.5,8.3,D
```

---

### 4.4 OpenRouteService (ORS)
- **สถานะ:** ฟรี ไม่ต้องบัตรเครดิต
- **Free tier:** 2,000 requests/day, 40 req/min
- **Package:** `npm install openrouteservice-js` (v0.4.1)
- **ต้องการ:** API Key (สมัครฟรีที่ openrouteservice.org)

```
POST https://api.openrouteservice.org/v2/directions/driving-car
Content-Type: application/json
Authorization: {API_KEY}

{
  "coordinates": [[lon_start, lat_start], [lon_end, lat_end]],
  "alternatives": true,       # ← ขอ 2 เส้นทาง
  "geometry": true,
  "instructions": false
}

# Response: GeoJSON
routes[0] → เส้นทาง 1 (fastest)
routes[1] → เส้นทาง 2 (alternative)
routes[0].geometry.coordinates → array ของ waypoints
routes[0].summary.distance    → ระยะทาง (เมตร)
routes[0].summary.duration    → เวลา (วินาที)
```

---

### 4.5 Nominatim (OSM Geocoding)
- **สถานะ:** ฟรี 100% ไม่ต้อง API Key
- **Rate limit:** 1 request/second (fair use)
- **Package Python:** `geopy` v2.4.1

```
GET https://nominatim.openstreetmap.org/search
    ?q={ชื่อสถานที่}&format=json&limit=5&countrycodes=th

# Response
[{
  "lat": "13.7523",
  "lon": "100.4937",
  "display_name": "กรุงเทพมหานคร..."
}]
```

---

## 5. Tech Stack (Verified Versions)

### Frontend
```
Next.js 14          App Router
Leaflet.js 2.0      Interactive map
leaflet.heat 0.2.0  Heatmap layer
Tailwind CSS 3      UI styling
openrouteservice-js 0.4.1
TypeScript 5
```

### Backend
```
Python FastAPI 0.138.0    REST API
Pandas 3.0.3              Data manipulation
NumPy 2.5.0               Math operations
Scikit-learn 1.9.0        IDW/ML utilities
PyKrige 1.7.3             Kriging (optional upgrade)
geopy 2.4.1               Geocoding helper
uvicorn                   ASGI server
```

### Database
```
Supabase (PostgreSQL)     มีอยู่แล้วจาก Vireana
PostGIS extension         Spatial queries
```

### Deploy
```
Frontend  → Vercel (ฟรี)
Backend   → DigitalOcean SGP1 (มีอยู่แล้ว)
Database  → Supabase (ฟรี tier)
```

---

## 6. IDW Algorithm (CS Core)

Inverse Distance Weighting — คำนวณค่า PM2.5 ณ จุดที่ไม่มี sensor

```python
# algorithms/idw.py
import numpy as np

def idw_interpolation(target_lat, target_lon, stations, power=2):
    """
    คำนวณค่า PM2.5 ประมาณ ณ พิกัดที่กำหนด
    
    stations: list of dict
      [{"lat": 13.7, "lon": 100.5, "pm25": 68}, ...]
    power: ค่า p (ยิ่งมาก สถานีใกล้มีอิทธิพลมากขึ้น)
    """
    # คำนวณระยะห่างจากทุกสถานี (Euclidean approximation)
    distances = []
    for s in stations:
        d = np.sqrt((target_lat - s["lat"])**2 + (target_lon - s["lon"])**2)
        distances.append(max(d, 0.0001))  # ป้องกัน division by zero
    
    distances = np.array(distances)
    weights = 1.0 / (distances ** power)
    pm25_values = np.array([s["pm25"] for s in stations])
    
    # Weighted average
    estimated_pm25 = np.sum(weights * pm25_values) / np.sum(weights)
    return round(estimated_pm25, 2)


def score_route(waypoints, stations, power=2):
    """
    คำนวณค่า PM2.5 เฉลี่ยสะสมตลอดเส้นทาง
    waypoints: [[lat, lon], [lat, lon], ...]
    """
    pm25_along_route = []
    for wp in waypoints:
        # ใช้แค่ 5 สถานีใกล้สุด (ประสิทธิภาพดีกว่า)
        nearby = sorted(stations, 
                       key=lambda s: (s["lat"]-wp[0])**2 + (s["lon"]-wp[1])**2)[:5]
        pm25 = idw_interpolation(wp[0], wp[1], nearby, power)
        pm25_along_route.append(pm25)
    
    return {
        "average_pm25": round(np.mean(pm25_along_route), 2),
        "max_pm25": round(np.max(pm25_along_route), 2),
        "pm25_along_route": pm25_along_route
    }
```

---

## 7. AQI Color Standard (WHO / กรมควบคุมมลพิษ)

| PM2.5 (µg/m³) | ระดับ | สี | คำแนะนำ |
|---------------|-------|-----|---------|
| 0 – 25 | ดี | 🟢 เขียว | ออกได้ตามปกติ |
| 26 – 37 | ปานกลาง | 🟡 เหลือง | กลุ่มเสี่ยงควรระวัง |
| 38 – 50 | มีผลต่อกลุ่มเสี่ยง | 🟠 ส้ม | ผู้ป่วยควรลดกิจกรรมนอกบ้าน |
| 51 – 90 | มีผลต่อสุขภาพ | 🔴 แดง | ทุกคนควรลดกิจกรรมนอกบ้าน |
| > 90 | อันตราย | 🟣 ม่วง | งดออกนอกบ้าน ใส่ N95 |

---

## 8. Web Speech API (Audio Accessibility)

```typescript
// components/AudioAlert.tsx
const speakResult = (route1: RouteData, route2: RouteData) => {
  const synth = window.speechSynthesis;
  
  const recommended = route1.avg_pm25 < route2.avg_pm25 ? route1 : route2;
  const text = `
    เส้นทางที่แนะนำคือเส้นทาง ${recommended.name}
    ค่าฝุ่น PM 2.5 เฉลี่ย ${recommended.avg_pm25} ไมโครกรัมต่อลูกบาศก์เมตร
    ระดับ${recommended.aqi_label} ระยะทาง ${recommended.distance} กิโลเมตร
    ใช้เวลาประมาณ ${recommended.duration} นาที
  `;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'th-TH';  // ภาษาไทย
  utterance.rate = 0.9;
  synth.speak(utterance);
};

// Browser support: Chrome ✅ | Firefox ✅ | Safari ✅ | Edge ✅
// ไม่ต้อง install library เพิ่ม — built-in ใน browser ทุกตัว
```

---

## 9. Database Schema

```sql
-- Supabase / PostgreSQL

-- สถานีวัดคุณภาพอากาศ
CREATE TABLE stations (
  id          TEXT PRIMARY KEY,    -- stationID จาก air4thai
  name_th     TEXT,
  name_en     TEXT,
  lat         FLOAT NOT NULL,
  lon         FLOAT NOT NULL,
  province    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ค่า PM2.5 รายชั่วโมง
CREATE TABLE pm25_readings (
  id          BIGSERIAL PRIMARY KEY,
  station_id  TEXT REFERENCES stations(id),
  pm25        FLOAT,
  aqi         INT,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับ query เร็ว
CREATE INDEX idx_readings_station_time 
  ON pm25_readings(station_id, recorded_at DESC);

-- Cron job sync ทุก 1 ชั่วโมง (Supabase Edge Functions)
```

---

## 10. API Keys ที่ต้องสมัคร

| Service | URL สมัคร | ใช้เวลา | ต้องบัตรเครดิต |
|---------|----------|---------|---------------|
| OpenWeatherMap | openweathermap.org/api | 5 นาที | ❌ |
| OpenRouteService | openrouteservice.org/dev | 5 นาที | ❌ |
| NASA FIRMS | firms.modaps.eosdis.nasa.gov/api | 1-2 วัน | ❌ |
| air4thai | ไม่ต้องสมัคร (open) | — | ❌ |
| Nominatim | ไม่ต้องสมัคร (open) | — | ❌ |

> ทุก API ฟรีและไม่ต้องบัตรเครดิต เหมาะกับ Final Year Project 100%

---

## 11. Development Phases

### Phase 1 — Data Layer (สัปดาห์ 1-2)
- สมัคร API keys ทั้งหมด
- เขียน service ดึงข้อมูลจาก air4thai + OpenWeatherMap
- ตั้ง Supabase schema + sync ข้อมูลสถานี
- ทดสอบ IDW algorithm กับข้อมูลจริง

### Phase 2 — Backend (สัปดาห์ 3-4)
- สร้าง FastAPI endpoints ทั้งหมด
- Integrate OpenRouteService (2 เส้นทาง)
- เขียน Route Scoring ด้วย IDW
- Unit test algorithm

### Phase 3 — Frontend (สัปดาห์ 5-7)
- Next.js + Leaflet map
- Heatmap layer แสดง PM2.5 ทั่วประเทศ
- Route comparison panel UI
- Web Speech API integration

### Phase 4 — Polish & Demo (สัปดาห์ 8)
- Responsive design
- Error handling + loading states
- Deploy Vercel + DigitalOcean
- เตรียม demo scenarios

---

## 12. สิ่งที่ทำให้โปรเจกต์นี้โดดเด่น

| จุด | เหตุผล |
|-----|-------|
| IDW Spatial Interpolation | CS Algorithm จริง ไม่ใช่แค่ CRUD app |
| Multi-source Data Fusion | รวม 3 API ต่างประเภท |
| Accessibility (Audio) | Social Impact ชัดเจน ผู้สูงอายุ/ผู้พิการ |
| Route Comparison | ไม่มีใน App ไทยที่มีอยู่ปัจจุบัน |
| ทำได้คนเดียว 1 เทอม | Scope พอดี Demo ได้ทันที |

---

*ClearPath Project Blueprint — Verified June 2026*
