# ClearPath Community

> พยากรณ์ PM2.5 และเครือข่ายข้อมูลคุณภาพอากาศที่ชุมชนช่วยกันตรวจสอบ

ClearPath ใช้ Air4Thai เป็นแหล่งข้อมูลสถานีทางการ, NASA FIRMS สำหรับจุดความร้อน
และเปิดให้ประชาชนถ่ายภาพเครื่องวัด PM2.5 ผ่านกล้องภายในแพลตฟอร์ม เมื่อส่งภาพแล้ว
ระบบจะตรวจ OCR, ภาพต่อเนื่อง, GPS, เวลา และภาพซ้ำร่วมกัน เคสที่มั่นใจสูงจะอนุมัติและ
เผยแพร่อัตโนมัติ ส่วนเคสที่ไม่ชัดเจนจะคงสถานะ pending และเข้าคิวข้อยกเว้นให้ผู้ดูแลตรวจ

## ฟีเจอร์หลัก

- แผนที่ PM2.5 จาก Air4Thai และพื้นผิว IDW
- พยากรณ์ PM2.5 ระยะสั้นรายสถานี พร้อมช่วงความไม่แน่นอน
- จุดความร้อนจาก NASA FIRMS เฉพาะข้อมูลอายุไม่เกิน 12 ชั่วโมง พร้อมระดับเฝ้าระวัง/สูง
- กล้องในแอปด้วย `getUserMedia` ไม่มีตัวเลือกอัปโหลดจากแกลเลอรี
- Camera session และ timestamp ที่ Server ลงนาม อายุไม่เกิน 5 นาที
- ตรวจชนิด/ความสมบูรณ์ของไฟล์ภาพ, exact hash และ perceptual hash เพื่อกันภาพซ้ำ
- OCR อ่านค่าหลังอัปโหลดเป็น draft ผู้ใช้ตรวจแก้ก่อนยืนยัน และระบบอนุมัติอัตโนมัติเมื่อหลักฐานทั้งชุดผ่านเกณฑ์
- Air4Thai ภายใน 5 กม. เป็นค่าหลัก; Community Report เป็นข้อมูลเสริม
- นอกระยะ 5 กม. รายงานต้องผ่านการตรวจอัตโนมัติหรือ Admin, Trust ≥60, อายุไม่เกิน 3 ชั่วโมง และผ่านกติกาหลายแหล่งก่อนเติม IDW
- คำขอบคุณจากชุมชนพร้อมดาว 1–5 จำกัดผู้ใช้อยู่ภายใน 3 กม./GPS ≤200 ม. ดาวยังใช้ปรับ Trust เมื่อมีอย่างน้อย 3 คน และให้รางวัลเฉพาะความเห็นที่ตรง consensus
- จุดชุมชนที่เข้า IDW ถูกรวมด้วย clustering 2 กม./60 นาทีและ weighted median ก่อนใช้งาน
- เก็บพิกัดจริงสำหรับ Admin แต่เลื่อนตำแหน่งสาธารณะ 120–250 เมตรเพื่อลดความเสี่ยงต่อความเป็นส่วนตัว
- จำกัดรายงาน 6 ครั้ง/ผู้ใช้/24 ชั่วโมง และรางวัลจากคำขอบคุณที่ช่วยชุมชน 5 ครั้ง/24 ชั่วโมง
- ข่าว/ประกาศชุมชน, กิจกรรม, คะแนน, badge และ Top Contributor 7 วัน
- ประวัติรายสถานีและ LOOCV เปรียบเทียบ IDW/Kriging
- มุมมองรายการ, ตัวอักษรใหญ่, high contrast และ reduced motion
- Mobile-first UX สำหรับจอ 360–430px: หน้าแรก `/` เป็นแผนที่พร้อม status card,
  หน้าอากาศ `/air`, ส่งข้อมูล `/report` และชุมชน `/community` แยก URL ชัดเจน,
  ฟอร์มรายงาน 3 ขั้นตอน, ชุมชนแบบ progressive disclosure, bottom navigation,
  touch target อย่างน้อย 44px และ input 16px ป้องกัน iOS auto-zoom

## Technology stack

| ชั้นระบบ              | เทคโนโลยี                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Web frontend          | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 และ stylesheet แยก foundation/user/admin |
| แผนที่                | Leaflet + React Leaflet, OpenStreetMap tiles และ IDW surface ที่เขียนเอง                             |
| Backend API           | Python 3.12, FastAPI, Pydantic v2 และ HTTPX                                                          |
| Database/Auth/Storage | Supabase PostgreSQL, Supabase Auth, private Storage bucket และ Realtime invalidation events          |
| External data         | Air4Thai, NASA FIRMS และ OpenWeather                                                                 |
| OCR/AI                | OpenAI Responses API แบบ optional; fail-closed automatic review + Admin exception queue              |
| Forecast              | XGBoost offline artifacts พร้อม quality activation gate และ statistical fallback                     |
| Notification          | In-App inbox, Service Worker, Web Push/VAPID และ retryable outbox                                    |
| Testing/quality       | Pytest, Ruff, ESLint, TypeScript strict checks, Prettier และ Next production build                   |
| Deployment            | Vercel Hobby: Next.js + Python FastAPI และ GitHub Actions scheduler รายชั่วโมง                       |

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
อยู่ฝั่ง server เท่านั้น การส่งรายงาน/ส่งคำขอบคุณพร้อมดาวใช้ Supabase Email OTP และ Admin API ใช้ role
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
GitHub Actions รายชั่วโมง → protected /api/cron/* บน Vercel Hobby
                          └─ Air4Thai → Supabase stations + pm25_readings
                              ├─ OpenWeather/FIRMS feature snapshots
                              ├─ current map + history
                              ├─ gated forecast inputs
                              └─ retention cleanup + sync audit
```

### Community report

```text
server camera session → getUserMedia + GPS → private draft + OCR
                                                │
                                                ▼
                               user confirms value → automatic review
                                                ├─ high confidence → approved map
                                                └─ uncertain → pending Admin exception queue
                                                                     │
                                                                     ▼
                                                nearby users rate proximity with 1–5 stars
```

ระบบอนุมัติอัตโนมัติเฉพาะเมื่อ OCR confidence ≥92%, ตรวจพบเครื่องวัดและหน้าจอชัด, ค่าที่ผู้ใช้ยืนยันสอดคล้อง,
GPS ≤100 ม., ไม่มี clock warning/ภาพซ้ำ และมีภาพต่อเนื่องเสริม 2 เฟรม หากไม่มี `OPENAI_API_KEY` หรือเกณฑ์ใดไม่ผ่าน
ระบบจะ fail closed เข้าคิวข้อยกเว้น และรายงาน pending จะไม่เปิดเผยค่า PM2.5

ก่อนส่ง ผู้ใช้ต้องระบุรุ่นเครื่อง, สถานะการสอบเทียบ, ความแม่นยำ GPS และยืนยันว่า
วัดกลางแจ้งหลังรอค่าคงที่แล้ว จุดที่อยู่ติดแหล่งกำเนิดโดยตรง เช่น ควันบุหรี่หรือท่อไอเสีย
ยังแสดงเป็นหลักฐานชุมชนได้ แต่จะไม่ถูกนำไปเติมพื้นผิวค่าฝุ่น

### Official vs Community rule

- ถ้ามี Air4Thai ภายใน 5 กม. ค่า Air4Thai เป็นข้อมูลหลัก ส่วนค่าประชาชนแสดงแยกเป็น `Community Report`
- สถานีรัฐถือว่าใช้เป็นข้อมูลหลักได้เมื่ออายุไม่เกิน 90 นาที; ถ้า API ต้นทางล่มใช้ snapshot ล่าสุดพร้อมสถานะ delayed/expired
- ถ้าไม่มี Air4Thai ที่สดใหม่ภายใน 5 กม. รายงานที่ระบบหรือ Admin อนุมัติ, Trust ≥60 และอายุไม่เกิน 3 ชั่วโมงจะเป็นผู้สมัคร `gap_fill`
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
| `GET /api/health`                                | Liveness ของ process                             |
| `GET /api/ready`                                 | Readiness ของ Supabase และความสดข้อมูลสถานี      |
| `GET /api/pm25/current`                          | สถานี Air4Thai ล่าสุดจาก Supabase                |
| `GET /api/forecast?station_id=&hours=`           | พยากรณ์ 1–24 ชั่วโมง                             |
| `GET /api/firms?days=`                           | จุดความร้อน NASA FIRMS ใน polygon นครปฐม         |
| `POST /api/community/capture-session`            | ออก camera session ที่ลงนามและหมดอายุใน 5 นาที   |
| `POST /api/community/report-drafts`              | อัปโหลดภาพสด + GPS และรับผล OCR ชั่วคราว         |
| `POST /api/community/report-drafts/{id}/submit`  | ยืนยันค่าและให้ระบบตรวจ/ส่งคิวข้อยกเว้น          |
| `GET /api/community/reports`                     | รายงานที่อนุมัติแล้ว                             |
| `GET /api/community/map-points`                  | จุดรวม weighted median สำหรับ IDW                |
| `GET /api/community/review-queue?lat=&lon=`      | ข้อมูล approved ภายใน 3 กม. ที่ยังขอบคุณได้      |
| `POST /api/community/reports/{id}/ratings`       | ส่งคำขอบคุณพร้อมดาวความใกล้เคียง 1–5             |
| `GET /api/community/announcements`               | ข่าวและประกาศ                                    |
| `GET /api/community/activities`                  | กิจกรรมและรางวัล                                 |
| `GET /api/community/leaderboard`                 | อันดับ reputation                                |
| `GET /api/community/me`                          | โปรไฟล์ คะแนน badge และประวัติของบัญชี           |
| `GET /api/admin/reports`                         | คิวข้อยกเว้นที่ระบบยังไม่มั่นใจ                  |
| `POST /api/admin/reports/{id}/moderate`          | Admin ตัดสินเคสข้อยกเว้นและบันทึกค่าที่ตรวจแล้ว  |
| `GET/PATCH/DELETE /api/admin/announcements/{id}` | จัดการ lifecycle ประกาศและ soft archive          |
| `GET /api/admin/sync-runs`                       | ประวัติ sync และ error ของแหล่งข้อมูล            |
| `GET /api/admin/forecast-models`                 | สถานะ artifact/quality gate ของแต่ละ horizon     |
| `GET /api/admin/forecast-false-safe-cases`       | คิว false-safe ที่ Admin ต้องตรวจรายเหตุการณ์    |
| `PUT /api/admin/forecast-false-safe-cases/…`     | บันทึกสาเหตุ/หลักฐานการตรวจ false-safe           |
| `GET /api/admin/forecast-release-decisions`      | ประวัติ shadow/canary/promote/rollback/reject    |
| `GET/PUT /api/notifications/preferences`         | พื้นที่ รัศมี และเกณฑ์แจ้งเตือนของผู้ใช้         |
| `POST /api/notifications/subscriptions`          | ลงทะเบียน PWA Web Push                           |
| `GET /api/notifications`                         | กล่องแจ้งเตือนในแอป                              |
| `GET /api/locations/search?q=`                   | ค้นหาตำบล/อำเภอจาก gazetteer ในระบบ              |
| `GET /api/history`                               | ประวัติรายสถานี                                  |
| `GET /api/validate`                              | LOOCV ของ interpolation                          |
| `GET /api/cron/sync`                             | Air4Thai → Supabase                              |
| `GET /api/cron/alerts`                           | ตรวจ PM2.5/FIRMS และส่ง Web Push แบบ deduplicate |
| `GET /api/cron/forecast-evaluation`              | Settle prediction, aggregate metrics และ drift   |

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run build
npm run test:e2e
.venv/Scripts/python -m ruff format --check backend api scripts
.venv/Scripts/python -m ruff check backend api scripts
.venv/Scripts/python -m pytest --cov=backend --cov-report=term-missing --cov-fail-under=75
.venv/Scripts/python -m pip check
.venv/Scripts/python -m pip_audit -r requirements.txt
python -m scripts.production_preflight --env-file .env.local --json --strict-features
```

CI รัน quality gate ชุดเดียวกัน รวม dependency audit และ E2E ที่ viewport 360/390/430 px
อัตโนมัติ ดูขั้นตอน deploy, backup/restore, incident และ pilot ได้ที่
[`docs/runbooks/README.md`](docs/runbooks/README.md)

## Forecast activation

ค่าเริ่มต้นใช้ deterministic baseline ที่ deploy เบา ส่วน XGBoost train แบบ offline ด้วย
`scripts/train_forecast.py` และไม่ถูกนำเข้า production dependency โมเดลแต่ละ horizon จะทำงาน
ต่อเมื่อมีข้อมูลอย่างน้อย 90 วัน/1,500 แถว, completeness ≥80%, MAE ดีกว่า persistence ≥5%
และ category accuracy ไม่ถอยเกิน 2 จุดเปอร์เซ็นต์ ชุดทดสอบต้องแยกตามเวลารายสถานี มีอย่างน้อย
300 แถว จากอย่างน้อย 3 สถานี และครอบคลุมอย่างน้อย 6 เดือน หาก artifact/feature ไม่ครบ API
จะ fallback โดยระบุ `fallback_reason` และจะไม่แสดง `model_version` เกินจริง

งานที่ต้องใช้ owner/production/field evidence ตรวจแบบ fail-closed ด้วย
`scripts/forecast_external_evidence.py`; exported operational logs ตรวจ secret/PII
ด้วย `scripts/audit_operational_logs.py`; และหลัง rollback ใช้
`scripts/verify_deployment.py --expect-baseline-fallback` เพื่อยืนยันว่า API
ไม่แสดง model/artifact identity และกลับสู่ baseline ทุกจุดจริง ส่วน
`scripts/measure_forecast_runtime.py` เก็บ aggregate availability/fallback/latency
โดยไม่บันทึก station ID หรือ response body; memory/cost ยังต้องยืนยันจาก Vercel
และ `scripts/evaluate_device_colocation.py` สรุป paired reference/device samples
แบบ de-identified โดยใช้ threshold ที่ pre-register ไว้ก่อนลงพื้นที่

## Production controls และงานที่ยังควรเสริม

ระบบปัจจุบันใช้ Supabase Auth/RBAC, distributed database rate limit, one-time capture,
private signed image, audit log, retention 30 วันสำหรับ rejected/180 วันสำหรับ approved,
PWA Web Push deduplication และ fail-closed model gate แล้ว ก่อนเปิดสาธารณะยังควรเพิ่ม malware scan,
device attestation/advanced image forensics, consent text ที่ผ่านฝ่ายกฎหมาย, incident monitoring
และ backtest หลายฤดูกาลด้วยข้อมูลภาคสนามจริง

ก่อน deploy ให้รัน production preflight และทำตาม checklist ใน runbook; script นี้อ่านอย่างเดียว
และไม่พิมพ์ secret ออกหน้าจอ ส่วน migration foundation มีคำสั่งทำลายข้อมูล จึงต้องสำรองและตรวจ
checksum ตาม `supabase/migrations/README.md` ก่อนทุกครั้ง

## Data attribution

- Air-quality observations: Air4Thai, Pollution Control Department
- Thermal anomalies: NASA FIRMS VIIRS NRT (SNPP/NOAA-20/NOAA-21)
- Nakhon Pathom service polygon: simplified from the Thailand Province Boundaries
  feature layer (`ADMIN_ID1=73`, EPSG:4326); source attribution Globetech Co., Ltd. /
  MERKATOR Co., Ltd. ระบบเก็บ polygon ใน repo เพื่อให้ validation ทำงานได้แม้ boundary service ล่ม
