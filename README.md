# ClearPath Community

แพลตฟอร์มติดตามและพยากรณ์ PM2.5 พร้อมรายงานจากชุมชน ใช้ Next.js 16 / React 19,
FastAPI และ Supabase โดย browser เรียกข้อมูลผ่าน `/api/*` เท่านั้น

## ระบบปัจจุบัน

รุ่นปัจจุบันใช้ XP `contribution-v3` และ `community-trust-v1` เปิด production วันที่ 7 พ.ย. 2569 เวลา 23:24 น. ตามคำยืนยันของเจ้าของโครงการ ดู [หลักฐานเปิดใช้](docs/verification/2026-11-07-xp-v3-live-release.md) และ [runbook XP](docs/runbooks/contribution-v3.md). ระบบคะแนนผลตรวจอิสระผู้รายงานและดาวรุ่นเก่าถูกถอดจาก runtime แล้ว ประวัติ ledger/audit ยังคงเก็บตามนโยบาย

- **ค่าปัจจุบัน:** Air4Thai บันทึกลง Supabase ผ่าน cron ทุก 30 นาที และมี GitHub backup เมื่อรอบหลักขาดหาย
- **พยากรณ์:** อ่าน raw CAMS / Open-Meteo ที่เก็บไว้ สูงสุด 120 ชั่วโมงตามข้อมูลที่มี
  แยก collector รายสถานีและกริด ไม่มี local model, การเฉลี่ยหลาย provider หรือการปรับค่าด้วยชุมชน
- **รายงาน:** ถ่ายภาพหรือเลือก JPEG/PNG/WEBP/HEIC/HEIF ไม่เกิน 8 MB → private draft → OCR number-only → ส่งรายงาน
  อ่านเลขได้เผยแพร่ค่า OCR อัตโนมัติ อ่านไม่ได้ให้ rejected และถ่ายใหม่ Admin อ่านผลย้อนหลังเท่านั้น
- **ข้อมูลภาพ:** ภาพจากคลังต้องมีเวลาและพิกัด EXIF ที่ใช้ได้; backend ตรวจต้นฉบับเอง
  EXIF ที่ไม่มี timezone ใช้ UTC+7 ได้เฉพาะเมื่อพิกัดอยู่ในประเทศไทย
  เก็บต้นฉบับแบบ private และล้าง EXIF จากภาพ preview; ไม่ใช้ GPS ตอนส่งแทนพิกัดภาพเก่า
- **XP:** `contribution-v3` เพิ่มโบนัสรายงานแรก/รายสัปดาห์ และเพดานรวม 70 XP/วัน (90 ในวันที่ได้โบนัสสัปดาห์) โดยเก็บคะแนน/ยศเดิม ใช้ ledger และ control แยกจาก Trust; เปิดใช้กติกาปัจจุบันแล้วโดยมีวันเปลี่ยนนโยบายที่ตรวจย้อนหลังได้ ดู [ข้อกำหนดและ gate เปิดใช้](docs/superpowers/specs/2026-11-07-contribution-v3.md)
- **ปฏิสัมพันธ์:** เมื่อเปิด `community-trust-v1` เสียง Like/Dislike ใหม่ที่ผ่านเกณฑ์ใช้คำนวณ **Trust ชุมชน** แยกจากผลตรวจอิสระเดิม แต้ม ยศ และความต่อเนื่อง ไม่มีผลต่อ XP, IDW หรือ backend gap-fill; เมื่อปิดฟีเจอร์ยังเป็น social เท่านั้น ดู [กติกาและการดูแลระบบ](docs/runbooks/community-trust-v1.md)
  backend ดาวยังคงไว้เพื่อ compatibility และรักษาพฤติกรรมคะแนนเดิม
- **คำขอวัด:** สร้างคำขอรัศมีคงที่ 2 กม. แสดงชื่อผู้ขอตาม identity preference
  จำกัดคำขอเปิดอยู่หนึ่งรายการต่อบัญชี; หมุดแสดงเฉพาะ active/scheduled
- **XP:** รายงาน 10 XP, ช่วยคำขอเพิ่ม 5 XP ตามหลักฐานและโควตาเดิม
  ยศอิง lifetime XP ที่ 0/100/500/1500/5000 เท่านั้น จำนวนวันแสดงเป็นสถิติ
- **สิ่งแวดล้อม:** อากาศปัจจุบันจาก Open-Meteo และ NASA FIRMS satellite hotspots
  ใน polygon นครปฐม อายุไม่เกิน 12 ชั่วโมง; hotspot ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว
- **การแจ้งเตือน:** inbox ในแอปและ LINE แบบยินยอม พร้อม outbox/retry/deduplication
- **หน้าจอ:** ทุกอุปกรณ์ใช้ mobile frame สูงสุด 430px พร้อมการตรวจ browser text enlargement, forced contrast และ reduced motion

### IDW สองบริบท

| บริบท                           | ข้อมูลและเงื่อนไข                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| เลือกสถานที่บนแผนที่            | วง 2 กม.; Air4Thai สดไม่เกิน 1 ชม. และรายงาน approved ที่วัดไม่เกิน 3 ชม.; distance-only inverse-square IDW ด้วย haversine ไม่มี Trust/XP/stability multiplier |
| Community gap-fill ฝั่ง backend | approved/fresh, Trust ≥60, GPS ≤200 ม., ไม่ติดแหล่งกำเนิด/ภาพซ้ำ และ corroboration จากผู้ใช้ต่างคนอย่างน้อย 2 ราย; เก็บกติกา clustering/weighted median เดิม   |

Place IDW ใช้พิกัดรายงานสาธารณะที่ obfuscate แล้ว จึงเป็นค่าประมาณ ไม่ใช่ค่าตรวจวัดตรงจุด
เมื่อมีข้อมูลตรงพิกัดจะเลือกค่านั้นเพื่อหลีกเลี่ยงการหารด้วยศูนย์ หากไม่มีข้อมูลที่ใช้ได้จะไม่สร้างค่าแทน
การแสดงค่าที่ใกล้ GPS ที่สุดเป็นอีกมุมมองหนึ่ง แยกจาก Place IDW และตัวกรองชั้นแผนที่

## โครงสร้างและลำดับอ่านโค้ด

```text
app/                       URL, layout และ error boundaries
frontend/
  components/pages/        ประกอบหน้าจอ
  components/app/          shell, map cards และแผงควบคุม
  components/map/          Leaflet layers + MapBehaviors
  components/panels/       รายงาน, กล้อง, พยากรณ์ และการตั้งค่า
  components/community/    engagement, XP และโปรไฟล์สมาชิก
  hooks/                   data hooks + useMapPage orchestration
  lib/                     API client, cache และ pure presentation functions
  types/                   API contracts; ui.ts สำหรับ UI-only types
  styles/                  foundation, user-app, admin-app, legal, mobile-frame
api/index.py               Vercel entry ของ FastAPI
backend/
  main.py                  middleware, routers และ error handling
  routers/                 HTTP validation/authorization boundary
  services/                workflow และ external adapters
    community/             submission, public/privacy presentation, review และ XP
    measurement/           lifecycle และ batch persistence ของคำขอวัด
    store_*.py              stations/CAMS, community, notifications, operations
    store_client.py        shared connection/retry/identifier boundary
    supabase_client.py     stable workflow re-exports
  algorithms/              pure calculations ไม่มี network/DB
  models/                  Pydantic API contracts
  tests/                   unit, integration, contract และ privacy tests
scripts/                   current operational/evaluation/rehearsal tools
supabase/migrations/       ประวัติ migrations; ไม่แก้ไฟล์ที่ apply แล้ว
```

ลำดับนำเสนอ: `app/layout.tsx` → `MapPageClient` → `useMapPage` → `api-client`
→ router ของ feature → service → pure algorithm / persistence ของโดเมน

`frontend/types/index.ts` และ `backend/models/schemas.py` เป็น API contract barrels ที่ต้อง mirror กัน
`store_client.py` เป็น connection เดียวของ persistence ทุกโดเมน
`supabase_client.py` คงเป็น seam เดิมสำหรับ workflow query overrides
ส่วน query แยกตามโดเมนแล้ว ไม่มี wrapper ส่งต่อทีละฟังก์ชันเพิ่มอีกชั้น

### Data flow

```text
Air4Thai → sync cron → Supabase stations/history → API → map
CAMS → bounded collectors → stored snapshots/ready grid generation → API → forecast
image + location → private draft + OCR → automatic publication → public obfuscated report
measurement request → invitations/claims → report matching → notification + XP
```

## รันในเครื่อง

ต้องมี Node.js/npm และ Python 3.12

```sh
npm ci
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env.local
```

Windows ใช้ `.venv/Scripts/python` แทน `.venv/bin/python`
production dependencies อ่านจาก `requirements.txt` ทั้ง pip และ package metadata
SciPy/PyKrige/Matplotlib ใช้ประเมินผลในเครื่องเท่านั้น ไม่รวมใน production requirements

### Local demo โดยไม่ใช้ Supabase

ตั้งค่าใน `.env.local`:

```dotenv
LOCAL_DEMO_MODE=true
NEXT_PUBLIC_LOCAL_DEMO_MODE=true
CAPTURE_SESSION_SECRET=local-only-secret-at-least-32-characters
BACKEND_ORIGIN=http://127.0.0.1:8000
```

```sh
# terminal 1
.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
# terminal 2
npm run dev
```

เปิด `http://localhost:3000` ข้อมูลชุมชน demo อยู่ในหน่วยความจำและหายเมื่อปิด backend
station snapshot มีใน repo; ถ้าไม่มี stored CAMS จะแสดง unavailable
demo ไม่เปิดเองใน production และไม่ได้จำลองผล OCR เมื่อไม่มี OpenAI key
บริการค้นหาสถานที่/อากาศ/ภาพแผนที่อาจใช้ network ตาม provider ที่ตั้งค่า

การเชื่อมฐานข้อมูลจริงให้ตรวจ [migration record](supabase/migrations/README.md)
และ [คู่มือฐานข้อมูลปัจจุบัน](docs/runbooks/fresh-project-2026-11-01.md)
ก่อนเสมอ ไม่รัน foundation migration ซ้ำบนฐานข้อมูลที่มีข้อมูลแล้ว

## API และขอบเขตความปลอดภัย

API schema ฉบับเต็มดูที่ FastAPI `/docs` และ `/openapi.json` บน backend origin
เช่น `http://127.0.0.1:8000/docs`

| กลุ่ม         | Endpoints หลัก                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| สถานี/ประวัติ | `/api/pm25/current`, `/api/history`, `/api/history/map`                                                   |
| พยากรณ์       | `/api/forecast`, `/api/forecast-grid/metadata`, `/api/forecast-grid/frames`                               |
| รายงาน        | `/api/community/capture-session`, `/api/community/report-drafts`, `/api/community/reports`                |
| ปฏิสัมพันธ์   | `/api/community/reports/{id}/reaction`, `/api/community/reports/{id}/comments`                            |
| ชุมชน/XP      | `/api/community/me`, `/api/community/me/xp`, `/api/community/me/xp-events`, `/api/community/members/{id}` |
| คำขอวัด       | `/api/measurement-requests`                                                                               |
| บริการ        | `/api/locations/*`, `/api/weather`, `/api/firms`, `/api/notifications/*`                                  |
| ตรวจสถานะ     | `/api/health`, `/api/ready`, `/api/admin/*`                                                               |

Admin/Moderator เป็น read-only ใช้ role ฝั่ง server ไม่รับ admin key จาก browser
พิกัดรายงานจริงและ metadata ภาพไม่อยู่ใน public API; public pin ใช้ stable obfuscation 120–250 ม.
ภาพรายงานอยู่ private storage และเปิดผ่านลิงก์อายุสั้น
credentials ระดับ service-role/OpenAI/cron อยู่ฝั่ง server เท่านั้น

`POST /api/community/data-issues` ถูกถอดแล้ว แต่ Admin ยังอ่านประวัติปัญหาเดิมได้
retired forecast/Admin endpoints คง empty/unavailable/paused responses เพื่อ compatibility
ไม่มี flag ที่เปิด pipeline ที่อ้างตารางเลิกใช้กลับมาได้ ดู [forecast state](docs/runbooks/forecast-reset.md)

## ตรวจคุณภาพ

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run test:grid:db
npm run test:xp:db
npm run test:identifiers:db
npm run test:identifiers:cutover
npm run build
npm run test:e2e
.venv/bin/python -m ruff format --check backend api scripts
.venv/bin/python -m ruff check backend api scripts
.venv/bin/python -m pytest --cov=backend --cov-report=term-missing --cov-fail-under=80
.venv/bin/python -m pip check
```

Database rehearsals ใช้ PGlite/fixtures ในเครื่อง ไม่ใช่ production database
Coverage thresholds เดิมยังคงไว้; map orchestration มี tests เพิ่มสำหรับ selection, deep links และการสลับโหมด
ดู [ผล refactor](docs/refactor-2026-11-02.md), [ERD](docs/database/erd.mmd)
และ [data dictionary](docs/database/data-dictionary.md) ประกอบการนำเสนอ

## แหล่งข้อมูลและคู่มือ

- Air4Thai — กรมควบคุมมลพิษ
- CAMS / Open-Meteo — raw provider forecasts พร้อม attribution ใน UI
- NASA FIRMS — VIIRS satellite hotspots ไม่ใช่การยืนยันเหตุไฟไหม้
- OpenStreetMap — Leaflet tiles และ Photon fallback; Geoapify ใช้ server-only key เมื่อกำหนดไว้
- [Operations runbooks](docs/runbooks/README.md)
- [CAMS grid](docs/runbooks/cams-forecast-grid.md)
- [Measurement requests](docs/runbooks/measurement-requests.md)
- [OCR evaluation](docs/runbooks/ocr-evaluation.md)

โค้ด local/ML forecast ที่เลิกใช้เก็บประวัติใน Git; การออกแบบ self-forecast ใหม่เป็นงานแยก
และต้องมี schema, validation และ release evidence ใหม่ ไม่ใช่การเปิด flag เดิม

### Contribution and evidence v2

Implementation, rules, tests and server-only rollout/rollback: [delivery notes](docs/superpowers/specs/2026-11-05-contribution-v2-implementation.md).
The additive migration defaults to v1. `COMMUNITY_V2_ENABLED` prepares the code; the DB release pointer activates contribution/evidence/gap-fill together. The temporary voting radius is 500 m, including both reported GPS error radii.
