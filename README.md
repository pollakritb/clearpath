# ClearPath Community

> พยากรณ์ PM2.5 และเครือข่ายข้อมูลคุณภาพอากาศที่ชุมชนช่วยกันตรวจสอบ

ClearPath ใช้ Air4Thai เป็นแหล่งข้อมูลสถานีทางการ, NASA FIRMS สำหรับจุดความร้อน
และเปิดให้ประชาชนถ่ายภาพเครื่องวัด PM2.5 ผ่านกล้องภายในแพลตฟอร์ม เมื่อส่งภาพแล้ว
ผู้ดูแลต้องเปิดภาพ อ่านค่า และกรอก PM2.5 ก่อนอนุมัติให้เผยแพร่บนแผนที่
OCR เป็นตัวช่วยอ่านในอนาคต/เมื่อมี key แต่ไม่ใช่ค่าหลักของ MVP

## ฟีเจอร์หลัก

- แผนที่ PM2.5 จาก Air4Thai และพื้นผิว IDW
- พยากรณ์ PM2.5 ระยะสั้นรายสถานี พร้อมช่วงความไม่แน่นอน
- จุดความร้อนจาก NASA FIRMS เฉพาะข้อมูลอายุไม่เกิน 12 ชั่วโมง พร้อมระดับเฝ้าระวัง/สูง
- กล้องในแอปด้วย `getUserMedia` ไม่มีตัวเลือกอัปโหลดจากแกลเลอรี
- Camera session และ timestamp ที่ Server ลงนาม อายุไม่เกิน 5 นาที
- ตรวจชนิด/ความสมบูรณ์ของไฟล์ภาพ, exact hash และ perceptual hash เพื่อกันภาพซ้ำ
- OCR อ่านค่าหลังอัปโหลดเป็น draft ผู้ใช้ตรวจแก้ก่อนยืนยัน และ Admin อ่านภาพ/กรอกค่าที่ตรวจแล้วก่อนเผยแพร่
- Air4Thai ภายใน 5 กม. เป็นค่าหลัก; Community Report เป็นข้อมูลเสริม
- นอกระยะ 5 กม. รายงานต้องผ่าน Admin, Trust ≥60, อายุไม่เกิน 3 ชั่วโมง และผ่านกติกาหลายแหล่งก่อนเติม IDW
- Community Rating แบบ 1–5 ดาว จำกัดผู้ใช้อยู่ภายใน 3 กม./GPS ≤200 ม. ปรับ Trust เมื่อมีอย่างน้อย 3 คน และให้รางวัลเฉพาะคะแนนที่ตรง consensus
- จุดชุมชนที่เข้า IDW ถูกรวมด้วย clustering 2 กม./60 นาทีและ weighted median ก่อนใช้งาน
- เก็บพิกัดจริงสำหรับ Admin แต่เลื่อนตำแหน่งสาธารณะ 120–250 เมตรเพื่อลดความเสี่ยงต่อความเป็นส่วนตัว
- จำกัดรายงาน 6 ครั้ง/ผู้ใช้/24 ชั่วโมง และคะแนนจากการช่วยตรวจ 5 ครั้ง/24 ชั่วโมง
- ข่าว/ประกาศชุมชน, กิจกรรม, คะแนน, badge และ Top Contributor 7 วัน
- ประวัติรายสถานีและ LOOCV เปรียบเทียบ IDW/Kriging
- มุมมองรายการ, ตัวอักษรใหญ่, high contrast และ reduced motion
- Mobile-first UX สำหรับจอ 360–430px: bottom navigation, map sheet, touch target
  อย่างน้อย 44px, input 16px ป้องกัน iOS auto-zoom และ Admin workflow แบบคอลัมน์เดียว

## Technology stack

| ชั้นระบบ              | เทคโนโลยี                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Web frontend          | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 และ stylesheet แยก foundation/user/admin |
| แผนที่                | Leaflet + React Leaflet, OpenStreetMap tiles และ IDW surface ที่เขียนเอง                             |
| Backend API           | Python 3.12, FastAPI, Pydantic v2 และ HTTPX                                                          |
| Database/Auth/Storage | Supabase PostgreSQL, Supabase Auth, private Storage bucket และ Realtime invalidation events          |
| External data         | Air4Thai, NASA FIRMS และ OpenWeather                                                                 |
| OCR/AI                | OpenAI Responses API แบบ optional; Admin verification เป็นแหล่งตัดสินสุดท้าย                         |
| Forecast              | XGBoost offline artifacts พร้อม quality activation gate และ statistical fallback                     |
| Notification          | In-App inbox, Service Worker, Web Push/VAPID และ retryable outbox                                    |
| Testing/quality       | Pytest, Ruff, ESLint, TypeScript strict checks, Prettier และ Next production build                   |
| Deployment            | Vercel deployment เดียว: Next.js frontend + Python FastAPI entrypoint + Vercel Cron                  |

## Architecture

```text
Next.js 16 / React 19 ── /api/* ── FastAPI
       │                              ├─ services: Air4Thai, Supabase, FIRMS, OCR
       │                              └─ algorithms: IDW, forecast, trust, LOOCV
       └─ Leaflet map                       │
                                           ▼
                                  Supabase + private image bucket
```

Frontend รู้จักเฉพาะ `/api/*`; service-role, OpenAI, VAPID private key และ cron secret
อยู่ฝั่ง server เท่านั้น การส่งรายงาน/ช่วยตรวจใช้ Supabase Email OTP และ Admin API ใช้ role
`moderator`/`admin` จากตาราง `profiles` โดยไม่รับ user id หรือ admin key จาก browser

### Code layout

```text
app/                         Next.js routes/layout เท่านั้น
frontend/
  components/app/            application orchestration และ shell
  components/map/            Leaflet layers/controls
  components/panels/         feature panels แยก subcomponent ตามโดเมน
  hooks/                      client data state
  lib/                        API client และ pure browser utilities
  types/                      TypeScript contracts แยกตามโดเมน
backend/
  routers/                    HTTP validation/response boundary
  services/                   external sources และ workflow orchestration
    community/                draft, evidence, presenter และ rating/moderation
  algorithms/                 pure functions ไม่มี network/database I/O
  models/                     Pydantic contracts แยกตามโดเมน
  core/                       config, errors, auth helpers และ AQI
docs/assets/ui-archive/       ภาพ QA เก่า ไม่ถูกโหลดใน runtime
```

`frontend/types/index.ts` และ `backend/models/schemas.py` เป็น public contract barrels
ที่ต้อง mirror กัน ส่วน UI-only types ไม่ export ผ่าน contract barrel

## Data flow

### Official data

```text
Vercel Cron รายชั่วโมง → Air4Thai → Supabase stations + pm25_readings
                      ├─ OpenWeather/FIRMS feature snapshots
                      ├─ current map + history
                      ├─ gated forecast inputs
                      └─ retention cleanup + sync audit
```

### Community report

```text
server camera session → getUserMedia + GPS → private draft + advisory OCR
                                                │
                                                ▼
                            user checks/edits value → pending moderation
                                                │
                                                ▼
                           Admin checklist + verified value → approved map
                                                │
                                                ▼
                              nearby users rate proximity with 1–5 stars
```

OCR เป็นตัวช่วย Admin ไม่ใช่ผู้อนุมัติ หากไม่มี `OPENAI_API_KEY` ระบบยังทำงานครบ
เพราะ Admin อ่านค่าโดยตรงจากภาพ รายงาน pending จะไม่เปิดเผยค่า PM2.5 ใด ๆ

ก่อนส่ง ผู้ใช้ต้องระบุรุ่นเครื่อง, สถานะการสอบเทียบ, ความแม่นยำ GPS และยืนยันว่า
วัดกลางแจ้งหลังรอค่าคงที่แล้ว จุดที่อยู่ติดแหล่งกำเนิดโดยตรง เช่น ควันบุหรี่หรือท่อไอเสีย
ยังแสดงเป็นหลักฐานชุมชนได้ แต่จะไม่ถูกนำไปเติมพื้นผิวค่าฝุ่น

### Official vs Community rule

- ถ้ามี Air4Thai ภายใน 5 กม. ค่า Air4Thai เป็นข้อมูลหลัก ส่วนค่าประชาชนแสดงแยกเป็น `Community Report`
- สถานีรัฐถือว่าใช้เป็นข้อมูลหลักได้เมื่ออายุไม่เกิน 90 นาที; ถ้า API ต้นทางล่มใช้ snapshot ล่าสุดพร้อมสถานะ delayed/expired
- ถ้าไม่มี Air4Thai ที่สดใหม่ภายใน 5 กม. รายงานที่ Admin อนุมัติ, Trust ≥60 และอายุไม่เกิน 3 ชั่วโมงจะเป็นผู้สมัคร `gap_fill`
- ผู้สมัครจะเข้า IDW ได้เมื่อมีผู้รายงานคนละคนอย่างน้อย 2 คน วัดใกล้กันภายใน 2 กม./60 นาทีและค่าเข้ากันได้ หรือผู้ส่งมี Trust ≥80 พร้อมเครื่องที่ระบุว่าสอบเทียบแล้ว
- รายงานต้องมี GPS accuracy ไม่เกิน 200 เมตร, ไม่เป็นภาพซ้ำ และไม่วัดติดแหล่งกำเนิดโดยตรง จึงจะเข้า IDW ได้
- ค่าที่ต่างจาก Air4Thai มากจะไม่ถูกซ่อน แต่แสดงเป็นความผิดปกติเฉพาะจุดและรอ community verification
- เกณฑ์สีใช้มาตรฐาน PCD พ.ศ. 2566: 0–15, 15.1–25, 25.1–37.5, 37.6–75 และ ≥75.1 µg/m³
- ค่าจากประชาชนติดป้ายว่าเป็น “ค่าขณะวัด” ไม่กล่าวอ้างว่าเป็นค่าเฉลี่ย 24 ชั่วโมง

พิกัดจริง เวลา และภาพถูกเก็บเพื่อการตรวจสอบในหลังบ้าน ตำแหน่งที่สาธารณะเห็นเป็นพิกัดที่
เลื่อนแบบคงที่ต่อรายงาน 120–250 เมตร พร้อมป้ายบอกความละเอียด ไม่ควรนำไปใช้ระบุตัวบ้าน

## Setup

```bash
npm install
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
```

1. รัน `supabase/schema.sql` ใน Supabase SQL Editor
2. รัน `supabase/migrations/20260717_production_foundation.sql` (รีเซ็ตเฉพาะข้อมูล Community
   ชุดทดลอง ไม่ลบ `stations`/`pm25_readings`)
3. รัน `supabase/migrations/20260722_tor_alignment.sql` ต่อจาก foundation (additive; ห้ามรัน foundation ซ้ำใน production)
4. เปิด Email OTP ใน Supabase Auth แล้วกำหนด role ผู้ตรวจใน `profiles`
5. คัดลอก `.env.example` เป็น `.env.local` และเติม keys
6. seed ข้อมูลครั้งแรกด้วย `GET /api/cron/sync` พร้อม `Authorization: Bearer <CRON_SECRET>`

```bash
# terminal 1
.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000

# terminal 2
npm run dev
```

### Local demo without Supabase

ถ้า Supabase project ยังไม่พร้อม ให้ตั้ง `LOCAL_DEMO_MODE=true` เฉพาะเครื่องพัฒนา
ระบบจะใช้ station snapshot ใน repo และเก็บรายงาน/ภาพ/คะแนนไว้ในหน่วยความจำ:

```powershell
$env:LOCAL_DEMO_MODE="true"
$env:CAPTURE_SESSION_SECRET="local-only-secret-at-least-32-characters"
.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8011
```

ตั้ง `BACKEND_ORIGIN=http://127.0.0.1:8011` แล้วรัน `npm run dev` ตามปกติ
ข้อมูล demo จะหายเมื่อปิด Backend และโหมดนี้จะไม่เปิดเองโดยอัตโนมัติใน production

## API

| Method · Path                                    | หน้าที่                                          |
| ------------------------------------------------ | ------------------------------------------------ |
| `GET /api/pm25/current`                          | สถานี Air4Thai ล่าสุดจาก Supabase                |
| `GET /api/forecast?station_id=&hours=`           | พยากรณ์ 1–24 ชั่วโมง                             |
| `GET /api/firms?days=`                           | จุดความร้อน NASA FIRMS ใน polygon นครปฐม         |
| `POST /api/community/capture-session`            | ออก camera session ที่ลงนามและหมดอายุใน 5 นาที   |
| `POST /api/community/report-drafts`              | อัปโหลดภาพสด + GPS และรับผล OCR ชั่วคราว         |
| `POST /api/community/report-drafts/{id}/submit`  | ยืนยันค่าที่ผู้ใช้เห็นและส่งเข้าคิว Admin        |
| `GET /api/community/reports`                     | รายงานที่อนุมัติแล้ว                             |
| `GET /api/community/map-points`                  | จุดรวม weighted median สำหรับ IDW                |
| `GET /api/community/review-queue?lat=&lon=`      | รายงาน approved ภายใน 3 กม. สำหรับ peer review   |
| `POST /api/community/reports/{id}/ratings`       | ให้คะแนนความใกล้เคียง 1–5 ดาว                    |
| `GET /api/community/announcements`               | ข่าวและประกาศ                                    |
| `GET /api/community/activities`                  | กิจกรรมและรางวัล                                 |
| `GET /api/community/leaderboard`                 | อันดับ reputation                                |
| `GET /api/community/me`                          | โปรไฟล์ คะแนน badge และประวัติของบัญชี           |
| `GET /api/admin/reports`                         | คิว moderation (Supabase role)                   |
| `POST /api/admin/reports/{id}/moderate`          | Admin กรอกค่าจากภาพแล้วอนุมัติ/ปฏิเสธ            |
| `GET/PATCH/DELETE /api/admin/announcements/{id}` | จัดการ lifecycle ประกาศและ soft archive          |
| `GET /api/admin/sync-runs`                       | ประวัติ sync และ error ของแหล่งข้อมูล            |
| `GET /api/admin/forecast-models`                 | สถานะ artifact/quality gate ของแต่ละ horizon     |
| `GET/PUT /api/notifications/preferences`         | พื้นที่ รัศมี และเกณฑ์แจ้งเตือนของผู้ใช้         |
| `POST /api/notifications/subscriptions`          | ลงทะเบียน PWA Web Push                           |
| `GET /api/notifications`                         | กล่องแจ้งเตือนในแอป                              |
| `GET /api/locations/search?q=`                   | ค้นหาตำบล/อำเภอจาก gazetteer ในระบบ              |
| `GET /api/history`                               | ประวัติรายสถานี                                  |
| `GET /api/validate`                              | LOOCV ของ interpolation                          |
| `GET /api/cron/sync`                             | Air4Thai → Supabase                              |
| `GET /api/cron/alerts`                           | ตรวจ PM2.5/FIRMS และส่ง Web Push แบบ deduplicate |

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
.venv/Scripts/python -m ruff format --check backend api scripts
.venv/Scripts/python -m ruff check backend api scripts
.venv/Scripts/python -m pytest
```

## Forecast activation

ค่าเริ่มต้นใช้ deterministic baseline ที่ deploy เบา ส่วน XGBoost train แบบ offline ด้วย
`scripts/train_forecast.py` และไม่ถูกนำเข้า production dependency โมเดลแต่ละ horizon จะทำงาน
ต่อเมื่อมีข้อมูลอย่างน้อย 90 วัน/1,500 แถว, completeness ≥80%, MAE ดีกว่า persistence ≥5%
และ category accuracy ไม่ถอยเกิน 2 จุดเปอร์เซ็นต์ หาก artifact/feature ไม่ครบ API จะ fallback
โดยระบุ `fallback_reason` และจะไม่แสดง `model_version` เกินจริง

## Production controls และงานที่ยังควรเสริม

ระบบปัจจุบันใช้ Supabase Auth/RBAC, distributed database rate limit, one-time capture,
private signed image, audit log, retention 30 วันสำหรับ rejected/180 วันสำหรับ approved,
PWA Web Push deduplication และ fail-closed model gate แล้ว ก่อนเปิดสาธารณะยังควรเพิ่ม malware scan,
device attestation/advanced image forensics, consent text ที่ผ่านฝ่ายกฎหมาย, incident monitoring
และ backtest หลายฤดูกาลด้วยข้อมูลภาคสนามจริง

## Data attribution

- Air-quality observations: Air4Thai, Pollution Control Department
- Thermal anomalies: NASA FIRMS VIIRS NRT (SNPP/NOAA-20/NOAA-21)
- Nakhon Pathom service polygon: simplified from the Thailand Province Boundaries
  feature layer (`ADMIN_ID1=73`, EPSG:4326); source attribution Globetech Co., Ltd. /
  MERKATOR Co., Ltd. ระบบเก็บ polygon ใน repo เพื่อให้ validation ทำงานได้แม้ boundary service ล่ม
