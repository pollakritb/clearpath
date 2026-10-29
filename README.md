# ClearPath Community

> **Stored CAMS forecast mode:** A six-hour job saves raw PM2.5 forecasts from
> CAMS through Open-Meteo in Supabase. Public pages read the latest completed
> snapshot, up to five days of available future hours. ClearPath does not blend,
> bias-correct, or recalculate these values. The former local, ML, evaluation,
> and provider-sync pipelines remain paused. See
> `docs/runbooks/forecast-reset.md`.

> พยากรณ์ PM2.5 และเครือข่ายข้อมูลคุณภาพอากาศที่ชุมชนช่วยกันตรวจสอบ

ClearPath ใช้ Air4Thai เป็นแหล่งข้อมูลสถานีทางการ, NASA FIRMS สำหรับจุดความร้อน
และเปิดให้ประชาชนถ่ายภาพเครื่องวัด PM2.5 ผ่านกล้องภายในแพลตฟอร์ม เมื่อส่งภาพแล้ว
ระบบ OCR จะอ่านเฉพาะตัวเลข PM2.5 จากภาพ ถ้าอ่านได้จะเผยแพร่ค่า OCR อัตโนมัติ
ส่วนภาพที่อ่านเลขไม่ได้จะถูกปฏิเสธพร้อมเหตุผลและให้ผู้ใช้ถ่ายใหม่

## ฟีเจอร์หลัก

- แผนที่ PM2.5 จาก Air4Thai และพื้นผิว IDW
- พยากรณ์ PM2.5 ระยะสั้นรายสถานี พร้อมช่วงความไม่แน่นอน
- จุดความร้อนจาก NASA FIRMS เฉพาะข้อมูลอายุไม่เกิน 12 ชั่วโมง พร้อมระดับเฝ้าระวัง/สูง
- กล้องในแอปด้วย `getUserMedia` ไม่มีตัวเลือกอัปโหลดจากแกลเลอรี
- Camera session และ timestamp ที่ Server ลงนาม อายุไม่เกิน 5 นาที
- ตรวจชนิด/ความสมบูรณ์ของไฟล์ภาพ, exact hash และ perceptual hash เพื่อกันภาพซ้ำ
- OCR อ่านเฉพาะตัวเลข PM2.5 หลังอัปโหลดเป็น draft และเผยแพร่ค่า OCR อัตโนมัติเมื่อผู้ใช้ส่งรายงาน
- Air4Thai ภายใน 5 กม. เป็นค่าหลัก; Community Report เป็นข้อมูลเสริม
- นอกระยะ 5 กม. รายงานต้องผ่านการตรวจอัตโนมัติ, Trust ≥60, อายุไม่เกิน 3 ชั่วโมง และผ่านกติกาหลายแหล่งก่อนเติม IDW
- คำขอบคุณจากชุมชนพร้อมดาว 1–5 จำกัดผู้ใช้อยู่ภายใน 3 กม./GPS ≤200 ม. ดาวยังใช้ปรับ Trust เมื่อมีอย่างน้อย 3 คน และให้รางวัลเฉพาะความเห็นที่ตรง consensus
- จุดชุมชนที่เข้า IDW ถูกรวมด้วย clustering 2 กม./60 นาทีและ weighted median ก่อนใช้งาน
- หมุดรายงานผู้ใช้บนแผนที่รวมเฉพาะรายงานที่ระยะจริงบวกความคลาดเคลื่อน GPS ทั้งสองฝั่งไม่เกิน 300 ม. (ตรวจทุกคู่ ไม่เชื่อมเป็นสายยาว) รายการในหมุดอยู่ได้ 3 ชม.; ค่าเดียวใช้เฉพาะข้อมูล 60 นาทีล่าสุดที่ GPS ≤50 ม. และนับค่าล่าสุดเพียงหนึ่งครั้งต่อผู้ใช้ ถ้าค่าขัดแย้งจะไม่แสดงค่าเฉลี่ย พิกัดที่ส่งให้ browser ยังคงเป็นพิกัดสาธารณะที่ปกปิดแล้ว กติกานี้ไม่เปลี่ยนการรวม 2 กม. ของ IDW
- เก็บพิกัดจริงสำหรับ Admin แต่เลื่อนตำแหน่งสาธารณะ 120–250 เมตรเพื่อลดความเสี่ยงต่อความเป็นส่วนตัว
- ไม่จำกัดจำนวนรายงานต่อวัน; ยังจำกัดรางวัลจากคำขอบคุณที่ช่วยชุมชนไว้ 5 ครั้ง/24 ชั่วโมง
- ข่าว/ประกาศชุมชน, กิจกรรม, คะแนน, badge และ Top Contributor 7 วัน
- ประวัติรายสถานีและ LOOCV เปรียบเทียบ IDW/Kriging
- มุมมองรายการ, ตัวอักษรใหญ่, high contrast และ reduced motion
- Mobile-first UX สำหรับจอ 360–430px: หน้าแรก `/` เป็นแผนที่พร้อม status card,
  หน้าอากาศ `/air`, ส่งข้อมูล `/report` และชุมชน `/community` แยก URL ชัดเจน,
  ฟอร์มรายงาน 3 ขั้นตอน, ชุมชนแบบ progressive disclosure, bottom navigation,
  touch target อย่างน้อย 44px และ input 16px ป้องกัน iOS auto-zoom

## Technology stack

| ชั้นระบบ              | เทคโนโลยี                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Web frontend          | Next.js 16 App Router, React 19, TypeScript และ semantic CSS แยก foundation/legal/user/admin    |
| แผนที่                | Leaflet + React Leaflet, OpenStreetMap tiles และ IDW surface ที่เขียนเอง                        |
| Backend API           | Python 3.12, FastAPI, Pydantic v2 และ HTTPX                                                     |
| Database/Auth/Storage | Supabase PostgreSQL, Supabase Auth, private Storage bucket และ Realtime invalidation events     |
| External data         | Air4Thai, NASA FIRMS, CAMS/Open-Meteo และ GISTDA แบบ legal-gated                                |
| OCR/AI                | OpenAI Responses API แบบ number-only; อ่านได้เผยแพร่ทันที อ่านไม่ได้ให้ถ่ายใหม่                 |
| Forecast              | External-first 3 แหล่ง, raw comparison, uncertainty envelope และ gated local/community fallback |
| Notification          | In-App inbox, LINE Messaging API, signed webhook และ retryable outbox                           |
| Testing/quality       | Pytest, Ruff, ESLint, TypeScript strict checks, Prettier และ Next production build              |
| Deployment            | Vercel Hobby + Supabase Cron ทุก 30 นาที และ GitHub Actions สำรองเมื่อรอบหลักไม่สำเร็จ          |

## Architecture

```text
Next.js 16 / React 19 ── /api/* ── FastAPI
       │                              ├─ services: Air4Thai, Supabase, FIRMS, OCR
       │                              └─ algorithms: IDW, forecast, trust, LOOCV
       └─ Leaflet map                       │
                                           ▼
                                  Supabase + private image bucket
```

Frontend รู้จักเฉพาะ `/api/*`; service-role, OpenAI และ cron secret
อยู่ฝั่ง server เท่านั้น การส่งรายงาน/ส่งคำขอบคุณพร้อมดาวใช้ Supabase Email OTP และ Admin API แบบอ่านอย่างเดียวใช้ role
`moderator`/`admin` จากตาราง `profiles` โดยไม่รับ user id หรือ admin key จาก browser

### Code layout

```text
app/                         Next.js routes/layout เท่านั้น
frontend/
  components/app/            application orchestration และ shell
    MapChrome.tsx             ตัวควบคุม map shell; search/layers แยก component
  components/map/            Leaflet layers/controls
  components/panels/         feature panels แยก subcomponent ตามโดเมน
  hooks/                      client data state
  lib/                        API client และ pure browser utilities
    dashboard.ts              แปลง API data เป็น view model สำหรับแผนที่
    forecast-presentation.ts  ข้อความ/สถานะพยากรณ์ที่เป็น pure functions
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

### ลำดับอ่าน Codebase

1. เริ่มจาก `app/` เพื่อดู URL และ route entry ซึ่งตั้งใจให้บางและไม่มี business logic
2. อ่าน `frontend/components/app/ClearPathApp.tsx` เพื่อเห็นการประกอบหน้า แล้วไล่เข้า panel
   หรือ map component ที่สนใจ
3. การดึงข้อมูลอยู่ใน `frontend/hooks/` และผ่าน typed wrapper เดียวคือ
   `frontend/lib/api-client.ts`
4. ฝั่ง API เริ่มจาก router ชื่อเดียวกับ endpoint ใน `backend/routers/`; router รับ/คืน HTTP
   เท่านั้นและส่งงานต่อให้ service
5. Workflow และการเชื่อมผู้ให้บริการอยู่ใน `backend/services/`; `supabase_client.py`
   เป็น persistence facade ส่วน `local_store.py` เป็น implementation สำหรับ local demo เท่านั้น
6. สูตรที่ไม่มี I/O เช่น IDW, trust, forecast และ validation อยู่ใน `backend/algorithms/`
   และมี unit test คู่กันใน `backend/tests/`

## Data flow

### Official data

```text
Supabase Cron ทุก 30 นาที → protected /api/cron/sync บน Vercel Hobby
                            └─ Air4Thai → Supabase stations + pm25_readings + sync_runs
GitHub Actions นาทีที่ 7 และ 37 → backup sync เฉพาะเมื่อรอบหลักไม่สำเร็จ + alerts
ClearPath /api/pm25/current → อ่านค่าล่าสุดจาก Supabase → แผนที่และหน้าอากาศ
Browser ที่เปิดอยู่ → ตรวจข้อมูลล่าสุดทุก 5 นาที และเมื่อกลับมาเปิดแท็บ
```

### Community report

```text
server camera session → getUserMedia + GPS → private draft + OCR
                                                │
                                                ▼
                               user confirms value → automatic review
                                                ├─ numeric PM2.5 → approved map
                                                └─ no numeric reading → rejected + reasons → retake
                                                                     │
                                                                     ▼
                                                nearby users rate proximity with 1–5 stars
```

ระบบเผยแพร่เมื่อ OCR คืนตัวเลข PM2.5 เท่านั้น โดยใช้ค่า OCR เป็นค่าที่ตรวจแล้ว Confidence, device/display,
burst, เวลา, ภาพคล้าย และค่าที่ผู้ใช้ยืนยันเก็บไว้สำหรับ audit แต่ไม่ขวางการเผยแพร่ หากไม่มี `OPENAI_API_KEY`
หรือ OCR อ่านเลขไม่ได้ ระบบจะปฏิเสธพร้อมเหตุผลและไม่เปิดเผยค่า PM2.5 หรือภาพ Exact duplicate และ GPS >200 ม.
ยังถูกปฏิเสธก่อนเรียก OCR

ก่อนส่ง ผู้ใช้ต้องระบุรุ่นเครื่อง, ความแม่นยำ GPS และยืนยันว่า
วัดกลางแจ้งหลังรอค่าคงที่แล้ว จุดที่อยู่ติดแหล่งกำเนิดโดยตรง เช่น ควันบุหรี่หรือท่อไอเสีย
ยังแสดงเป็นหลักฐานชุมชนได้ แต่จะไม่ถูกนำไปเติมพื้นผิวค่าฝุ่น

### Official vs Community rule

- ถ้ามี Air4Thai ภายใน 5 กม. ค่า Air4Thai เป็นข้อมูลหลัก ส่วนค่าประชาชนแสดงแยกเป็น `Community Report`
- สถานีรัฐถือว่าใช้เป็นข้อมูลหลักได้เมื่ออายุไม่เกิน 90 นาที; ถ้า API ต้นทางล่มใช้ snapshot ล่าสุดพร้อมสถานะ delayed/expired
- ถ้าไม่มี Air4Thai ที่สดใหม่ภายใน 5 กม. รายงานที่ระบบอนุมัติ, Trust ≥60 และอายุไม่เกิน 3 ชั่วโมงจะเป็นผู้สมัคร `gap_fill`
- ผู้สมัครจะเข้า IDW ได้เมื่อมีผู้รายงานคนละคนอย่างน้อย 2 คน วัดใกล้กันภายใน 2 กม./60 นาทีและค่าเข้ากันได้เท่านั้น
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

### Place search on the map

Place suggestions appear after typing at least three characters (450 ms debounce);
Enter and the search button also work. The server uses Geoapify when a server-only
`GEOAPIFY_API_KEY` is configured. Otherwise it uses the public Photon demo API
for partial-name search in Thailand, with one-hour caching and OpenStreetMap
attribution. Photon has no availability guarantee and may rate-limit traffic;
configure Geoapify for reliable production scale. If the provider is unavailable,
the bundled gazetteer is a limited fallback.
The browser only calls `/api/locations/search` and never receives a provider key.
The OpenStreetMap/Leaflet map is retained; this feature does not use Google
Places results on a non-Google map.

Selecting a place enters a temporary 5 km focus mode. Its main PM2.5 value uses
only fresh Air4Thai stations within that radius (one station as a reference,
multiple via IDW). Community reports appear as supplementary evidence and do
not generate a headline value on their own. Leaving focus mode restores the
previous map layers and viewport.

## API

| Method · Path                                     | หน้าที่                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/health`                                 | Liveness ของ process                                                  |
| `GET /api/ready`                                  | Readiness ของ Supabase และความสดข้อมูลสถานี                           |
| `GET /api/pm25/current`                           | สถานี Air4Thai ล่าสุดจาก Supabase                                     |
| `GET /api/forecast?station_id=&hours=`            | พยากรณ์ที่เก็บใน Supabase สูงสุด 120 ชั่วโมง                          |
| `GET /api/firms?days=`                            | จุดความร้อน NASA FIRMS ใน polygon นครปฐม                              |
| `POST /api/community/capture-session`             | ออก camera session ที่ลงนามและหมดอายุใน 5 นาที                        |
| `POST /api/community/report-drafts`               | อัปโหลดภาพสด + GPS และรับผล OCR ชั่วคราว                              |
| `POST /api/community/report-drafts/{id}/submit`   | ยืนยันค่าและรับผลอนุมัติหรือปฏิเสธอัตโนมัติทันที                      |
| `GET /api/community/reports`                      | รายงานที่อนุมัติแล้ว                                                  |
| `GET /api/community/map-points`                   | จุดรวม weighted median สำหรับ IDW                                     |
| `GET /api/community/review-queue?lat=&lon=`       | ข้อมูล approved ภายใน 3 กม. ที่ยังขอบคุณได้                           |
| `POST /api/community/reports/{id}/ratings`        | ส่งคำขอบคุณพร้อมดาวความใกล้เคียง 1–5                                  |
| `GET /api/community/reports/{id}/engagement`      | จำนวน Like/Dislike และความคิดเห็นสาธารณะ (ไม่กระทบ Trust)             |
| `PUT/DELETE /api/community/reports/{id}/reaction` | เพิ่ม เปลี่ยน หรือยกเลิก Like/Dislike                                 |
| `POST /api/community/reports/{id}/comments`       | เพิ่มความคิดเห็นในรายงานที่เผยแพร่แล้ว                                |
| `GET /api/community/announcements`                | ประกาศ ClearPath + ลิงก์ข่าวคุณภาพอากาศ Google News (cache 1 ชม.)     |
| `GET /api/community/activities`                   | กิจกรรมและรางวัล                                                      |
| `GET /api/community/leaderboard`                  | อันดับ reputation                                                     |
| `GET /api/community/me`                           | โปรไฟล์ คะแนน badge และประวัติของบัญชี                                |
| `GET /api/admin/reports`                          | ประวัติผลตรวจอัตโนมัติ รูป และรายละเอียดสำหรับ audit (อ่านอย่างเดียว) |
| `GET/PATCH/DELETE /api/admin/announcements/{id}`  | จัดการ lifecycle ประกาศและ soft archive                               |
| `GET /api/admin/sync-runs`                        | ประวัติ sync และ error ของแหล่งข้อมูล                                 |
| `GET /api/admin/forecast-models`                  | สถานะ artifact/quality gate ของแต่ละ horizon                          |
| `GET /api/admin/forecast-false-safe-cases`        | คิว false-safe ที่ Admin ต้องตรวจรายเหตุการณ์                         |
| `PUT /api/admin/forecast-false-safe-cases/…`      | บันทึกสาเหตุ/หลักฐานการตรวจ false-safe                                |
| `GET /api/admin/forecast-release-decisions`       | ประวัติ shadow/canary/promote/rollback/reject                         |
| `GET/PUT /api/notifications/preferences`          | พื้นที่ รัศมี และเกณฑ์แจ้งเตือนของผู้ใช้                              |
| `GET /api/notifications`                          | กล่องแจ้งเตือนในแอป                                                   |
| `GET/POST/DELETE /api/notifications/line`         | สถานะ สร้างรหัส และยกเลิกการเชื่อม LINE                               |
| `POST /api/notifications/line/test`               | ส่งข้อความทดสอบเข้า LINE ที่เชื่อมไว้                                 |
| `POST /api/notifications/line/webhook`            | รับ signed webhook จาก LINE Messaging API                             |
| `GET /api/locations/search?q=`                    | ค้นหาตำบล/อำเภอจาก gazetteer ในระบบ                                   |
| `GET /api/history`                                | ประวัติรายสถานี                                                       |
| `GET /api/validate`                               | LOOCV ของ interpolation                                               |
| `GET /api/cron/sync`                              | Air4Thai → Supabase                                                   |
| `GET /api/cron/alerts`                            | ตรวจ PM2.5/FIRMS และส่ง LINE แบบ deduplicate                          |
| `GET /api/cron/forecast-evaluation`               | Settle prediction, aggregate metrics และ drift                        |

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
notification deduplication และ fail-closed model gate แล้ว ก่อนเปิดสาธารณะยังควรเพิ่ม malware scan,
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

### ภาพจากคลังและ metadata (local rollout)

หน้าส่งรายงานรองรับภาพ JPEG/PNG/WEBP/HEIC/HEIF ไม่เกิน 8 MB ทั้งถ่ายใหม่และเลือกจากคลัง
ภาพจากคลังอ่านเวลาและพิกัดจาก EXIF อัตโนมัติ ไม่มีช่องกรอกเองหรือเลือกจุดบนแผนที่
หากข้อมูลไม่ครบ ให้เลือกต้นฉบับที่มีข้อมูลครบหรือถ่ายใหม่ผ่าน ClearPath
เวลาส่ง เวลาแก้ไขไฟล์ และ GPS ปัจจุบันไม่ถูกใช้แทนเวลาและตำแหน่งของภาพเก่า
EXIF ที่ไม่มี timezone ใช้ UTC+7 ได้เฉพาะเมื่อพิกัดในภาพอยู่ในประเทศไทย
และบันทึก `exif_thailand_timezone` แยกจาก timezone ที่ฝังอยู่ในภาพ
หลังได้ภาพและ GPS ขณะส่ง ระบบอ่าน OCR อัตโนมัติ แสดงสรุปให้กดส่ง
ไม่มีช่องกรอกค่าฝุ่น รุ่นเครื่องวัด หรือวิธีวัด และแสดงโปรไฟล์ผู้รายงานเป็นค่าเริ่มต้น
ผู้ใช้เลือกปิดบังตัวตนเฉพาะรายงานได้ด้วย checkbox ก่อนกดส่ง

Backend อ่าน metadata จากต้นฉบับเอง เก็บต้นฉบับใน private bucket และสร้างภาพ JPEG
ที่ล้าง EXIF สำหรับ preview/signed URL ข้อมูลไฟล์ละเอียดเปิดเฉพาะ Admin
ไฟล์ต้นฉบับถูกลบตามวงจร retention เดียวกับหลักฐาน โดยการอนุมัติยังใช้ OCR number-only
ตำแหน่งจากภาพไม่ถือว่าได้รับความแม่นยำ GPS ณ เวลาวัดสำหรับ gap-fill

ก่อนเปิดใช้บนฐานข้อมูลจริง ต้อง apply
`supabase/migrations/20261028_gallery_evidence_metadata.sql`
การพัฒนา local demo ไม่ต้องเชื่อมฐานข้อมูลจริง
