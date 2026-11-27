# ClearPath

ระบบเฝ้าระวัง PM2.5 และข้อมูลชุมชน ใช้ Next.js/React เป็น frontend, FastAPI เป็น backend และ Supabase เป็นแหล่งข้อมูลหลัก Production รันบน VPS ผ่าน Docker Compose/Caddy ที่ `https://clearpath.plotpop.tech` ทุกหน้าจอใช้ mobile frame กว้างไม่เกิน 430px

## เริ่มอ่านโค้ด

| ส่วน                                                   | หน้าที่                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `app/`                                                 | Next.js routes, layout, metadata และ error boundaries      |
| `frontend/components/`, `frontend/hooks/`              | UI และ lifecycle ของหน้าจอ                                 |
| `frontend/lib/`, `frontend/types/`, `frontend/styles/` | API client, helpers, contracts และ styles                  |
| `backend/routers/`                                     | HTTP boundary และการตรวจสิทธิ์                             |
| `backend/services/`                                    | Workflows, external sources และ persistence                |
| `backend/algorithms/`                                  | Pure functions สำหรับคำนวณและนโยบาย ไม่มี network/DB       |
| `backend/models/`, `backend/core/`                     | Pydantic contracts, config, auth, errors และ observability |
| `backend/workers/`, `scripts/`, `.github/`             | Worker, เครื่องมือดูแลระบบ และ CI/schedulers               |
| `backend/tests/`, `e2e/`, `*.test.*`                   | Unit, integration และ browser regression tests             |
| `supabase/`                                            | Schema, bootstrap และ migration history                    |

ลำดับสำหรับนำเสนออยู่ใน [คู่มือนำเสนอ](docs/presentation.md) และ [สถาปัตยกรรม](docs/architecture.md)

## Feature ปัจจุบัน

| หน้า/ส่วน            | พฤติกรรม                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| แผนที่ `/`           | Air4Thai, รายงานชุมชน, Place IDW, ประวัติข้อมูล, CAMS grid และ satellite hotspots |
| อากาศวันนี้ `/air`   | สรุปค่าบริเวณที่เลือก ประวัติ และพยากรณ์จากผู้ให้บริการ                           |
| รายงาน `/report`     | ถ่าย/เลือกรูปเครื่องวัด, GPS, OCR, ตรวจค่า และส่งรายงาน                           |
| คำขอ `/requests`     | ขอให้ช่วยวัด ติดตามคำขอ และตั้งพื้นที่ช่วยเหลือ                                   |
| ข่าวสาร `/community` | ประกาศ ข่าว และกล่องแจ้งเตือน                                                     |
| โปรไฟล์/อันดับ       | ผลงานของตน คะแนน contribution-v3 และ Trust ชุมชน                                  |
| Settings             | พื้นที่ช่วยเหลือ, LINE, เงื่อนไขแจ้งเตือน และความเป็นส่วนตัว                      |
| Admin `/admin`       | ตรวจสถิติ รายงาน ภาพ OCR และ audit แบบอ่านอย่างเดียว                              |

### กติกาที่ต้องรักษา

- Air4Thai ถูก sync ตามงานอัตโนมัติ; frontend อ่านข้อมูลผ่าน `/api/*` จาก Supabase ไม่ดึง Air4Thai โดยตรง
- ข้อมูลทางการอายุ ≤1 ชั่วโมง ภายใน 5 กม. เป็นข้อมูลหลัก รายงานชุมชนเป็น supplementary
- CAMS ใช้ grid ที่จัดเก็บและเผยแพร่แบบ atomic; ข้อมูลขาดหรือเก่าต้องแสดงสถานะตามจริง ไม่สร้างค่าพยากรณ์เอง
- Place IDW ใช้ระยะ 2 กม., Air4Thai สด ≤1 ชั่วโมง และรายงาน approved/fresh ≤3 ชั่วโมง ใช้ public coordinates และ inverse-distance weights (1/d)
- Backend gap-fill แยกจาก Place IDW ต้องผ่าน freshness, Trust ≥60, GPS accuracy ≤200 ม., ไม่ติดแหล่งกำเนิด/ภาพซ้ำ และ corroboration จากอย่างน้อย 2 ผู้ใช้
- OCR อ่านภาพหลักภาพเดียว อ่านเลข PM2.5 ได้ให้ approved ด้วยค่า OCR; อ่านไม่ได้ให้ rejected พร้อมถ่ายใหม่ ภาพ burst และ flags อื่นเป็น audit metadata
- Exact duplicate และ GPS accuracy >200 ม. ถูกกันก่อน OCR; `pending` เป็นสถานะชั่วคราวระหว่างบันทึก ไม่รอ Admin ตัดสิน
- Like/Dislike/Comment ใช้ community-trust-v1; Trust ชุมชนไม่มีผลต่อ XP, IDW หรือ gap-fill
- XP ใหม่ใช้ contribution-v3; คงการอ่าน/settlement ledger เดิมที่คะแนนเก่าต้องใช้
- Admin/Moderator ไม่มีสิทธิ์อนุมัติ ปฏิเสธ แก้ไข ลบ เปลี่ยนบทบาท หรือยกเลิก XP ผ่าน dashboard
- Public coordinates ถูกเลื่อนแบบ stable 120–250 ม.; พิกัดจริงเปิดเฉพาะ Admin ภาพอยู่ใน private bucket และใช้ signed URL อายุสั้น
- Hotspots เป็นสัญญาณจากดาวเทียม ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว

## พัฒนาในเครื่อง

ใช้ Node.js 22 และ Python 3.12

```sh
npm ci
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

ใช้ `.env.example` เป็น template สำหรับติดตั้งใหม่ ค่า feature flags ที่เป็น `false` ไม่ใช่สถานะ production; เปิดเมื่อ schema, credentials และ worker ของฟีเจอร์นั้นพร้อมแล้ว เก็บ credentials จริงในไฟล์ local ที่ Git ignore เท่านั้น ห้ามนำ service-role/OpenAI/admin keys ไปไว้ในตัวแปร `NEXT_PUBLIC_*`

ตัวอย่าง backend demo ที่ไม่ต้องมี Supabase credentials:

```sh
LOCAL_DEMO_MODE=true CAPTURE_SESSION_SECRET=local-demo-capture-secret-at-least-32-bytes .venv/bin/uvicorn backend.main:app --reload --port 8000
```

อีก terminal:

```sh
NEXT_PUBLIC_LOCAL_DEMO_MODE=true npm run dev
```

Next จะ proxy `/api/*` ไป FastAPI ในโหมด dev ข้อมูล demo อยู่ใน memory และไม่ใช่ข้อมูล production หากไม่ตั้ง OpenAI key ระบบจะรายงานว่า OCR ไม่พร้อม ไม่สร้างค่าอ่านจำลอง ไม่มีโหมดเติมรายงานผ่าน `?demo=...` ในแอป

## ตรวจงาน

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run build
```

```sh
.venv/bin/python -m ruff format --check backend scripts
.venv/bin/python -m ruff check backend scripts
.venv/bin/python -m pytest --cov=backend --cov-fail-under=80
```

Browser tests ใช้ `npm run test:e2e` หลังติดตั้ง Chromium ด้วย `npm run test:e2e:install` ใช้ worker เดียวตาม config เพื่อไม่ให้ state ของบัญชี demo ชนกัน ชุด `1000 request paths` เป็น opt-in บน CI ด้วย `RUN_REQUEST_PATH_STRESS=true`

Tests ที่เกี่ยวข้องกับฐานข้อมูลใช้ isolated local PostgreSQL/PGlite ส่วน `npm run audit:ci` และ `pip_audit -r requirements.txt` ตรวจ dependencies

## Contracts และ production

- `frontend/types/index.ts` mirror `backend/models/schemas.py`; UI-only types อยู่ใน `frontend/types/ui.ts`
- ใช้รหัส entity เป็น string; ไม่แปลง BIGINT database IDs เป็น JavaScript number
- `/api/health` ตรวจแอป และ `/api/ready` แยก release readiness ออกจากความสดของข้อมูลสถานี
- Production VPS: ดู [ขั้นตอน deploy](docs/runbooks/vps-deployment.md); การ deploy แอปไม่ใช่การ apply migrations
- Production ใช้ IDW และ stored provider grids; ชุดทดลอง offline ถูกย้ายออกจาก source tree

ดู [คู่มือปฏิบัติการ](docs/runbooks/README.md), [ขอบเขต cleanup และ archive](docs/cleanup.md) และ [project conventions](AGENTS.md)

สำหรับตรวจงาน เริ่มจาก [คู่มือนำเสนอ](docs/presentation.md), [สถาปัตยกรรม](docs/architecture.md) และคำสั่งตรวจงานด้านบน เอกสาร audit และแผนงานเก่าแยกเก็บนอก repository ตาม [บันทึก cleanup](docs/cleanup.md)
