# ClearPath Production Completion Master Plan

วันที่จัดทำ: 2026-09-16  
สถานะเอกสาร: Execution plan — รอเริ่มดำเนินงาน  
ขอบเขต: ทำให้ ClearPath พร้อมใช้งานจริงบนมือถือ ตั้งแต่ข้อมูล PM2.5, รายงานจากผู้ใช้,
การตรวจอัตโนมัติ, การพยากรณ์, การแจ้งเตือน, Admin, ความปลอดภัย และการปฏิบัติการ

เอกสารที่ใช้ร่วมกัน:

- `README.md`
- `AGENTS.md`
- `docs/superpowers/plans/2026-08-03-production-pm25-forecast-plan.md`
- `docs/superpowers/specs/2026-07-15-clearpath-forecast-community-design.md`
- `docs/runbooks/production-deployment.md`
- `docs/runbooks/backup-restore.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/pilot-and-model-rollout.md`
- `docs/runbooks/security-privacy-legal.md`
- `docs/runbooks/vendor-dpa-inventory.md`

---

## 1. เป้าหมายของแผน

แผนนี้รวมงานที่ยังไม่สมบูรณ์หรือยังไม่มีหลักฐานทดสอบจริงให้เป็นลำดับเดียว โดยมีเป้าหมายว่า:

1. ผู้ใช้เปิดเว็บบนมือถือแล้วเห็นค่าฝุ่นใกล้ GPS ที่อธิบายที่มาและความสดได้
2. แผนที่แยกสถานีรัฐ เซนเซอร์ชุมชน รายงานบุคคล และ satellite hotspot ชัดเจน
3. ผู้ใช้ส่งรายงานผ่านกล้องจริง + GPS ได้ และระบบตรวจแบบ fail closed
4. ข้อมูลผู้ใช้มี Trust ที่อธิบายได้ ใช้เสริมข้อมูลหลักตามเกณฑ์ที่กำหนดเท่านั้น
5. พยากรณ์ภายนอกใช้งานได้ต่อเนื่อง เปรียบเทียบแหล่งข้อมูลได้ และไม่อ้างความแม่นยำเกินหลักฐาน
6. Google Login, LINE และ Web Push ใช้งานจริงพร้อมจัดการ consent/preferences
7. Admin จัดการคิวตรวจ ประกาศ ปัญหาข้อมูล การแจ้งเตือน และ forecast release ได้ครบ
8. ระบบผ่าน CI, security audit, browser/device QA, accessibility, performance และ operational drill
9. มีหลักฐานสำหรับ release ทุกครั้ง และย้อนกลับได้เมื่อเกิดเหตุ

## 2. ขอบเขตและสิ่งที่ไม่ทำ

### 2.1 อยู่ในขอบเขต

- เว็บแอป mobile-first และ PWA
- Air4Thai เป็นข้อมูล PM2.5 หลัก
- รายงานบุคคลและเซนเซอร์ชุมชนเป็นข้อมูลเสริม
- IDW แบบ haversine สำหรับพื้นผิวและ gap-fill ตามข้อกำหนด
- พยากรณ์จากผู้ให้บริการภายนอก และ ML ภายในเมื่อมีหลักฐานพร้อมเท่านั้น
- Google OAuth, LINE notification, Web Push
- Auto moderation ที่ใช้ OCR/GPS/เวลา/ภาพต่อเนื่อง/ภาพซ้ำร่วมกัน
- Admin, monitoring, backup/restore, privacy/security/legal readiness

### 2.2 ไม่อยู่ในขอบเขต

- ระบบนำทางหรือเปรียบเทียบเส้นทาง
- การเรียก satellite hotspot ว่าเป็นเหตุไฟไหม้ที่ยืนยันแล้ว
- Kriging ใน production
- การแสดงพิกัดจริงหรือภาพ private ของรายงานต่อสาธารณะ
- การเปิด ML โดยไม่มี backtest, shadow test, approval และ rollback
- การใช้ข้อความของระบบแทนคำแนะนำจากแพทย์หรือประกาศทางการ

## 3. สถานะฐาน ณ วันที่ 2026-09-16

### 3.1 สิ่งที่ผ่านแล้ว

- Production deploy ที่ commit `1080f33c696ef1d1d5e43b21ce3eea57aea39e87`
- `/api/health` และ `/api/ready` ตอบ `200`
- Production มีสถานี 177 แห่ง และข้อมูลพร้อมใช้ 148 แห่งตาม readiness snapshot
- Forecast รายสถานีตอบ `200` มี 24 จุดและผู้ให้บริการภายนอก 2 แหล่ง
- Forecast surface ตอบได้ 144 cells พร้อมระบุ `sparse_station_coverage`
- Weather, history, locations และ validation endpoints ตอบ `200`
- Static checks ผ่านในเครื่อง: Prettier, ESLint, TypeScript, Ruff และ build
- Frontend unit tests ผ่าน 35/35
- Backend tests ผ่าน 229/229
- Local E2E ผ่าน 80 และ skip 4 จากทั้งหมด 84 cases
- Python dependency audit ไม่พบช่องโหว่ที่ทราบ

### 3.2 ช่องว่างที่ต้องปิดก่อนถือว่าพร้อมใช้งานจริง

| ระดับ | ช่องว่าง                                                                  | ผลกระทบ                                                 |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| P0    | GitHub Quality workflow ยังล้ม                                            | ไม่มีหลักฐานว่า main พร้อม release                      |
| P0    | Next.js 16.2.11 และ `sharp` มี high/critical advisory                     | ความเสี่ยงด้านความปลอดภัย                               |
| P0    | E2E GPS hard-code origin port 3117 แต่ CI ใช้ 3000                        | browser suite ล้มทุก viewport ในกรณี GPS                |
| P0    | นิยามข้อมูลสดไม่ตรงกัน: current API ใช้ 60 นาที แต่ readiness ใช้ 90 นาที | ผู้ใช้และ monitor เห็นสถานะไม่ตรงกัน                    |
| P1    | Web Push ปิดและไม่มี VAPID keys                                           | ผู้ใช้เปิด notification ไม่ได้จริง                      |
| P1    | Google OAuth/role ยังไม่มี production E2E                                 | เสี่ยง login สำเร็จแต่ session/role ใช้ไม่ได้           |
| P1    | OCR, กล้องจริง, GPS permission และ submission ยังไม่ผ่าน device E2E       | flow หลักของผลิตภัณฑ์ยังไม่พิสูจน์                      |
| P1    | LINE ทดสอบหลักด้วย mock                                                   | ยังไม่มีหลักฐาน delivery, expiry และ dedup จริง         |
| P1    | Admin browser flows ยังไม่ครบ                                             | งาน moderation และ operation อาจติดขัด                  |
| P1    | Public community report = 0 ใน snapshot                                   | ยังพิสูจน์ Trust/corroboration/gap-fill ภาคสนามไม่ได้   |
| P1    | GISTDA gate ยังไม่อนุมัติ                                                 | แหล่ง forecast ที่สามยังไม่ควรเปิด                      |
| P1    | ML ไม่มี production artifact และข้อมูลหลายฤดู                             | ต้องคงปิดไว้                                            |
| P1    | FIRMS มี endpoint แต่ยังไม่มี positive-data drill                         | ยังไม่ยืนยัน alert flow เมื่อพบ hotspot จริง            |
| P1    | ไม่มีหลักฐาน restore drill                                                | backup อาจมีแต่กู้คืนไม่ได้จริง                         |
| P2    | frontend coverage 98% วัดเพียง `aqi` และ `idw`                            | ตัวเลขไม่สะท้อน UI/business logic ทั้งระบบ              |
| P2    | backend critical integrations หลายไฟล์ coverage ต่ำ                       | ความเสี่ยง regression ใน cron/provider/notification/OCR |
| P2    | ไม่มี WebKit/Firefox/real-device/performance/load test ครบ                | mobile readiness ยังไม่สมบูรณ์                          |
| P2    | Vendor/DPA/legal/health sign-off ยัง Pending                              | ยังไม่พร้อมเปิด public pilot เต็มรูปแบบ                 |

## 4. หลักการที่ห้ามละเมิดระหว่างดำเนินงาน

1. Frontend ติดต่อ backend ผ่าน `/api/*` เท่านั้น
2. Router บาง; business logic อยู่ใน services/algorithms
3. `backend/algorithms/` ต้อง pure, ไม่มี network/DB และมี unit tests
4. TypeScript API contract ต้องตรงกับ Pydantic schema
5. Supabase เป็น source of truth; Air4Thai ถูกเรียกผ่าน sync cron ไม่ยิงตรงจาก browser
6. Community report เริ่ม `pending`; เคสไม่ชัดเจนต้องคง pending
7. OCR เป็นเพียงหนึ่งสัญญาณ ห้ามใช้อนุมัติรายงานเพียงอย่างเดียว
8. ข้อมูล community เข้า IDW เฉพาะ approved, fresh, Trust ≥60 และผ่าน corroboration/calibration rule
9. Public coordinate ต้อง obfuscate แบบ stable 120–250 เมตร; พิกัดจริงเฉพาะ Admin
10. Browser ห้ามถือ service-role, OpenAI, LINE secret, VAPID private หรือ admin keys
11. Feature ที่ upstream ล้มต้องแสดง fallback/limited state โดยไม่สร้างข้อมูลปลอม
12. การเปลี่ยน dependency/framework ต้องอ่านเอกสาร Next.js รุ่นที่ติดตั้งก่อนแก้โค้ด

## 5. Definition of Ready ก่อนเริ่มแต่ละงาน

งานจะเข้า implementation ได้เมื่อมี:

- owner ชัดเจน
- acceptance criteria ที่ทดสอบได้
- ระบุข้อมูล/secret/account ที่จำเป็น
- ระบุผลกระทบต่อ API contract และ migration
- ระบุ rollback หรือ feature flag สำหรับงานเสี่ยง
- test fixture ที่ไม่ใช้ production secrets
- privacy review เมื่อแตะภาพ พิกัด ตัวตน หรือ notification token

## 6. ลำดับดำเนินงานรวม

| Wave | Phase | เป้าหมาย                                       | เริ่มได้เมื่อ                           |
| ---- | ----- | ---------------------------------------------- | --------------------------------------- |
| 0    | 0–2   | หยุดความเสี่ยงและทำฐานทดสอบให้เชื่อถือได้      | เริ่มทันที                              |
| 1    | 3–7   | ทำ flow ผู้ใช้หลักให้ใช้งานจริง                | Wave 0 ผ่าน                             |
| 2    | 8–11  | ทำ Admin, forecast, hotspot และ mobile quality | flow ที่เกี่ยวข้องพร้อม                 |
| 3    | 12–14 | ทำ operations, compliance และ release pilot    | Wave 1–2 ผ่าน                           |
| 4    | 15    | ML evidence program                            | มีข้อมูลจริงอย่างน้อย 6 เดือนและหลายฤดู |

ห้ามข้าม Wave 0 เพื่อเพิ่มฟีเจอร์ใหม่บน production

---

## Phase 0 — Release freeze, baseline และ ownership

### เป้าหมาย

ตรึงฐานอ้างอิง ลดความสับสนว่าอะไรผ่านแล้ว และกำหนดผู้รับผิดชอบงานที่ AI ทำเองไม่ได้

### งาน

- [x] `CP-BASE-001` บันทึก release SHA, production URL, Supabase project ref และ Vercel project ที่ถูกต้อง
- [x] `CP-BASE-002` สร้าง release evidence template: command, commit, timestamp, result, artifact/link
- [x] `CP-BASE-003` ทำ inventory feature flags และค่า production โดยเก็บเฉพาะชื่อ/สถานะ ไม่บันทึก secret
- [ ] `CP-BASE-004` กำหนด owner: product, data, security, privacy/legal, health communication และ incident commander
- [x] `CP-BASE-005` เปิด issue/backlog จาก task IDs ในเอกสารนี้และผูก dependency
- [x] `CP-BASE-006` งดเปิด ML/GISTDA/Web Push จนกว่า gate ของแต่ละส่วนจะผ่าน

### ผู้รับผิดชอบ

- AI: template, inventory จากโค้ด, issue checklist, baseline report
- User: ยืนยันชื่อผู้รับผิดชอบ บัญชี และสิทธิ์ production

### เกณฑ์ผ่าน

- มี release baseline ที่ทำซ้ำได้
- ไม่มี secret อยู่ใน git/log/document
- ทุก P0/P1 มี owner หรือระบุชัดว่า blocked by owner

## Phase 1 — Security dependency และ CI recovery

### เป้าหมาย

ทำให้ main ผ่าน Quality workflow และไม่มี known high/critical production dependency vulnerability

### งาน

- [x] `CP-SEC-001` อ่าน migration/deprecation guide ใน `node_modules/next/dist/docs/` สำหรับรุ่นเป้าหมาย
- [x] `CP-SEC-002` อัปเดต Next.js จาก 16.2.11 ไป patch ที่แก้ advisory โดยเลือกเวอร์ชัน compatible ล่าสุดที่ตรวจแล้ว
- [x] `CP-SEC-003` อัปเดต `sharp` เป็นเวอร์ชันที่แก้ advisory และตรงกับ Next.js
- [x] `CP-SEC-004` ตรวจ lockfile diff และห้ามเพิ่ม package ที่ไม่จำเป็น
- [x] `CP-CI-001` แก้ E2E geolocation origin ให้คำนวณจาก Playwright `baseURL`/runtime port ไม่ hard-code 3117
- [x] `CP-CI-002` รัน audit, format, lint, typecheck, unit, backend tests, build และ E2E ครบ
- [x] `CP-CI-003` push commit `11a75ea` และยืนยัน GitHub Quality run `35027864270` เขียวทุก job
- [x] `CP-SEC-005` เพิ่ม Dependabot/Renovate policy หรือ scheduled audit ถ้ายังไม่มี

### การทดสอบบังคับ

```text
npm audit --omit=dev --audit-level=high
npm run format:check
npm run lint
npm run typecheck
npm run test:unit -- --run
npm run build
.venv/Scripts/python -m ruff format --check backend api scripts
.venv/Scripts/python -m ruff check backend api scripts
.venv/Scripts/python -m pytest
npm run test:e2e
```

### เกณฑ์ผ่าน

- GitHub Quality workflow เขียวทุก job ที่ release SHA
- production dependencies ไม่มี high/critical advisory ที่ยังแก้ได้แต่ถูกเพิกเฉย
- GPS E2E ผ่านทุก mobile viewport
- build ไม่มี deprecation warning ที่กระทบ release

## Phase 2 — Data freshness, contracts และ observability baseline

### เป้าหมาย

ให้คำว่า fresh/delayed/expired เหมือนกันทั้ง API, UI, readiness, alert และเอกสาร

### งาน

- [x] `CP-DATA-001` กำหนด canonical thresholds แห่งเดียว: fresh ≤60 นาที, delayed ≤90 นาที, expired >90 นาที
- [x] `CP-DATA-002` ทำให้ readiness นับ fresh/delayed/expired จาก classifier เดียวกับ current API
- [x] `CP-DATA-003` เปิดเผย `recorded_at`, `age_minutes`, `data_status`, `source` และ `quality_flags` ใน contract ที่จำเป็น
- [x] `CP-DATA-004` ให้ frontend types mirror backend schemas และเพิ่ม OpenAPI contract tests
- [x] `CP-DATA-005` แสดง last updated/fallback state ด้วยภาษาที่ผู้ใช้เข้าใจ ไม่ใช้สีอย่างเดียว
- [x] `CP-DATA-006` เพิ่ม monitor สำหรับ station count, latest observation, stale ratio, sync duration และ upstream failure
- [x] `CP-DATA-007` ตรวจ Supabase cron ทุก 15 นาทีและ GitHub backup scheduler; alert เมื่อ primary ไม่ทำงาน
- [x] `CP-DATA-008` เพิ่ม production smoke หลัง release และหลัง backup cron เพื่อยืนยัน release SHA กับข้อมูล fresh จริง

### เกณฑ์ผ่าน

- API และ UI จัดสถานะ observation เดียวกัน 100% จาก fixture ชุดเดียวกัน
- `/api/ready` ไม่รายงานพร้อมเมื่อข้อมูลเกิน threshold ที่ตกลง
- มี alert เมื่อ sync ไม่เกิดตามช่วงเวลาที่กำหนด
- มี runbook อธิบาย primary cron, backup cron และ manual recovery

## Phase 3 — Test architecture และ coverage ที่สะท้อนความจริง

### เป้าหมาย

ให้ตัวเลข coverage และ test suite สะท้อนเส้นทางธุรกิจจริง ไม่ใช่เฉพาะ utility 2 ไฟล์

### งาน

- [x] `CP-TEST-001` ขยาย frontend coverage จาก `aqi/idw` ไปยัง API client, auth/session, hooks และ pure view-model logic
- [x] `CP-TEST-002` ตั้ง threshold แบบค่อยเป็นค่อยไปจาก baseline จริง ห้ามลดคุณภาพด้วยการ exclude ไฟล์สำคัญ
- [x] `CP-TEST-003` เพิ่ม unit tests สำหรับ loading/error/empty/stale/limited/offline states
- [x] `CP-TEST-004` เพิ่ม backend tests ให้ services สำคัญ: alerts, FIRMS, forecast providers, reconciliation, notification, OCR, retention และ Supabase boundary
- [x] `CP-TEST-005` เพิ่ม router integration tests สำหรับ cron, forecast, community และ admin authorization
- [x] `CP-TEST-006` เพิ่ม API schema snapshot/contract test ระหว่าง FastAPI OpenAPI และ TypeScript types
- [x] `CP-TEST-007` แยก test suites เป็น PR-fast, nightly-integration และ production-smoke
- [x] `CP-TEST-008` ลด skipped E2E: ระบุเหตุผลทุก skip และย้าย stateful flow ไป isolated test data

### เป้าหมาย coverage

- Algorithms/policy pure functions: ≥90% line และ branch สำคัญครบ
- Auth/moderation/privacy/notification decision logic: ≥85%
- Backend รวม: ไม่ต่ำกว่า 80% ระหว่างขยาย scope และเป้าหมายถัดไป ≥85%
- Frontend: รายงาน coverage บน scope ที่ประกาศชัด; ห้ามอ้าง 98% เป็น coverage ทั้งแอปจนกว่าจะวัดทั้ง scope

### เกณฑ์ผ่าน

- Coverage report ระบุ include/exclude และไม่มีตัวเลขชวนเข้าใจผิด
- Critical policy branches มี positive, negative, boundary และ failure tests
- PR suite ใช้เวลาเหมาะสมและ nightly suite ครอบคลุม integration ที่ช้ากว่า

## Phase 4 — Google OAuth, session, profile และ role

### เป้าหมาย

ผู้ใช้ login/logout ได้จริงบน production และ role User/Admin ถูกบังคับใช้ทั้ง UI และ API

### งาน

- [ ] `CP-AUTH-001` ตรวจ Google Cloud project ชื่อ ClearPath และ redirect URIs ของ localhost/preview/production
- [x] `CP-AUTH-002` ตรวจ Supabase ClearPath provider config, Site URL และ allowed redirect URLs
- [ ] `CP-AUTH-003` ตรวจ consent screen, scopes, authorized domains และ test/published status
- [ ] `CP-AUTH-004` ทดสอบ login ใหม่, refresh, logout, expired session, blocked popup และ cancelled consent
- [x] `CP-AUTH-005` ทดสอบ production account `pollakrit.b@ku.th` และ mapping role ผ่าน server-side authorization
- [x] `CP-AUTH-006` ป้องกันการเชื่อ role จาก client/local storage
- [x] `CP-AUTH-007` ทดสอบ profile name/avatar visibility ตาม anonymous consent ของแต่ละ report
- [x] `CP-AUTH-008` เพิ่ม audit log เมื่อ role เปลี่ยน โดยไม่เก็บ token/PII เกินจำเป็น

### เกณฑ์ผ่าน

- Login ผ่านอย่างน้อย Chrome Android, Safari iOS และ desktop browser
- User เปิด Admin API/UI ไม่ได้แม้แก้ client state
- Admin ที่กำหนดเข้าถึงได้หลัง refresh/re-login
- Anonymous report ไม่รั่วชื่อ รูป หรือพิกัดจริง

## Phase 5 — Report, camera, GPS, OCR และ auto moderation

### เป้าหมาย

ทำ flow “ถ่ายภาพเครื่องวัด → ยืนยัน GPS → ตรวจ → ส่ง” ให้สำเร็จบนอุปกรณ์จริง และอนุมัติอัตโนมัติเฉพาะเคสมั่นใจสูง

### งาน

- [ ] `CP-REPORT-001` ทดสอบ camera permission: allow, deny, retry, no camera, rear camera, orientation และ image rotation
- [ ] `CP-REPORT-002` ทดสอบ GPS: precise/approximate, timeout, denied, accuracy >200 เมตร และตำแหน่งเปลี่ยนระหว่างส่ง
- [x] `CP-REPORT-003` บีบอัดภาพฝั่ง client อย่างเหมาะสม แต่เก็บหลักฐานอ่านค่าได้
- [ ] `CP-OCR-001` ทำ real OCR integration test ด้วยภาพเครื่องวัดหลายยี่ห้อ แสงสะท้อน เบลอ และตัวเลขหลอก
- [x] `CP-OCR-002` เก็บ OCR confidence, extracted value และ failure reason โดยไม่เผย raw provider response
- [x] `CP-MOD-001` รวม OCR + GPS + timestamp + continuity + duplicate image + plausibility เป็น pure policy
- [x] `CP-MOD-002` กำหนด high-confidence auto-approve threshold และ fail closed เป็น `pending`
- [x] `CP-MOD-003` ทดสอบภาพซ้ำ exact/perceptual, EXIF mismatch, replay และค่าผิดช่วง
- [x] `CP-MOD-004` ทำ Admin correction โดยเก็บ original/result/auditor/reason/timestamp
- [x] `CP-REPORT-004` ตรวจ private bucket, signed URL expiry, upload limit, MIME sniffing และ malware-safe handling
- [x] `CP-REPORT-005` ทำ idempotency ป้องกันการกดส่งซ้ำเมื่อ network ช้า
- [ ] `CP-REPORT-006` เพิ่ม offline/failed upload recovery ที่ไม่เก็บภาพไว้นานเกิน consent

### ชุดภาพทดสอบขั้นต่ำ

- ค่าต่ำ/กลาง/สูงในทุกหลักจำนวน
- decimal point, หน่วยต่างกัน, หน้าจอ LED/LCD
- ภาพเอียง 0/90/180/270 องศา
- แสงน้อย แสงสะท้อน เบลอ บางส่วนถูกบัง
- ภาพไม่ใช่เครื่องวัด ภาพเดิม และ screenshot
- ค่าที่ OCR อ่านได้แต่ GPS/เวลา/continuity ไม่ผ่าน

### เกณฑ์ผ่าน

- ส่งรายงานสำเร็จบนอุปกรณ์จริงอย่างน้อย iPhone 1 รุ่นและ Android 2 รุ่น
- ไม่มีรายงานเผยแพร่จาก OCR เพียงสัญญาณเดียว
- duplicate/replay และ accuracy >200 เมตรไม่เข้า gap-fill
- ทุกการอนุมัติ/แก้ไขอธิบาย reason code ได้

## Phase 6 — Community Trust, gratitude, privacy และ gap-fill

### เป้าหมาย

นำข้อมูลผู้ใช้มาเสริมอย่างระมัดระวัง และทำให้ผู้ใช้เข้าใจว่า “ขอบคุณ” ไม่ใช่คะแนนนิยม

### งาน

- [x] `CP-COMM-001` สร้าง seeded staging dataset ที่มีผู้ใช้หลายคน Trust ต่างกัน พื้นที่/เวลา/อุปกรณ์ต่างกัน
- [ ] `CP-TRUST-001` ทดสอบ Trust pure function: report outcome, duplicate, admin correction, gratitude reason และ decay/cap
- [x] `CP-TRUST-002` ยืนยัน rule: approved + fresh + Trust ≥60 + corroborated ≥2 คน หรือ Trust ≥80 + calibrated device
- [x] `CP-TRUST-003` ป้องกัน self-corroboration ด้วย account/device/image/location/time identity signals
- [x] `CP-GAP-001` ทดสอบ gap-fill เมื่อไม่มี Air4Thai ใกล้พื้นที่ และเมื่อมีข้อมูลหลักกลับมา
- [x] `CP-GAP-002` บังคับ GPS accuracy ≤200 เมตร, ไม่ติดแหล่งกำเนิดโดยตรง และไม่ใช่ภาพซ้ำ
- [x] `CP-GRAT-001` ทดสอบ gratitude 1–5 ดาว เฉพาะ GPS ≤3 กม. และ report อายุ ≤3 ชม.
- [x] `CP-GRAT-002` เก็บ internal reason code ที่ตรงกับดาว แต่ public UI แสดงคำขอบคุณอย่างเหมาะสม
- [ ] `CP-PRIV-001` ตรวจ stable obfuscation 120–250 เมตร, k-anonymity risk และการ link จุดเดิมข้ามเวลา
- [x] `CP-PRIV-002` แสดง profile เฉพาะ report ที่ผู้ใช้ไม่ได้เลือกปิดบังตัวตน
- [ ] `CP-COMM-002` ทำ field trial อย่างน้อย 2–3 พื้นที่ ทั้งใกล้และไกลสถานีหลัก

### เกณฑ์ผ่าน

- Unit tests ครบ boundary Trust 59/60/79/80 และ freshness 179/180 นาที
- ไม่มีพิกัดจริงใน public API, log หรือ analytics
- Community ไม่ override Air4Thai ที่ fresh ภายใน 5 กม.
- มี field evidence ว่า corroboration/gap-fill ทำงาน ไม่ใช่เพียง seeded demo

## Phase 7 — Notifications: LINE และ Web Push

### เป้าหมาย

ผู้ใช้เลือกช่องทาง พื้นที่ เหตุการณ์ และเกณฑ์แจ้งเตือนได้ โดยได้รับข้อความครั้งเดียวในเวลาที่ควร

### งานร่วม

- [ ] `CP-NOTI-001` ทำ notification preference schema กลาง: channel, threshold, areas, event types, quiet hours, consent
- [ ] `CP-NOTI-002` ทำ idempotency/dedup key และ delivery log ที่ไม่เก็บ payload อ่อนไหวเกินจำเป็น
- [ ] `CP-NOTI-003` ทดสอบ retry/backoff, partial provider failure, revoked token และ rate limit
- [ ] `CP-NOTI-004` เพิ่ม unsubscribe/revoke/delete token ที่ใช้งานได้จริง
- [ ] `CP-NOTI-005` ทำข้อความ 5 ระดับฝุ่นและ satellite hotspot โดยระบุ source/time/พื้นที่

### LINE

- [ ] `CP-LINE-001` ตรวจ callback/webhook URL, signature verification และ state/nonce expiry
- [ ] `CP-LINE-002` ทดสอบ link, unlink, re-link, expired link code และ account mismatch บน production
- [ ] `CP-LINE-003` ส่ง test notification จริงและตรวจ delivery log/dedup
- [ ] `CP-LINE-004` ทดสอบ PM2.5 threshold, hotspot event และ quiet hours จริง

### Web Push

- [ ] `CP-PUSH-001` สร้าง VAPID key pair ผ่าน secure owner workflow
- [ ] `CP-PUSH-002` ตั้ง `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` และเปิด `PUSH_ENABLED` หลังทดสอบ
- [ ] `CP-PUSH-003` ทดสอบ service worker/update/subscription rotation
- [ ] `CP-PUSH-004` ทดสอบ Android installed PWA และ iOS/iPadOS Add to Home Screen
- [ ] `CP-PUSH-005` ลบ invalid subscriptions หลัง 404/410 และไม่ retry ถาวร

### เกณฑ์ผ่าน

- Test message ถึงอุปกรณ์จริงทั้ง LINE และ Web Push
- เหตุการณ์เดียวไม่ส่งซ้ำใน dedup window
- ผู้ใช้ยกเลิกได้และ token ถูกลบ/disable
- notification ไม่กล่าวว่า hotspot คือไฟไหม้ที่ยืนยันแล้ว

## Phase 8 — Admin operations

### เป้าหมาย

ให้ผู้ดูแลดำเนินงานประจำวันและรับมือเหตุผิดปกติได้โดยไม่แก้ฐานข้อมูลด้วยมือ

### งาน

- [ ] `CP-ADMIN-001` E2E queue: filter pending, open evidence, approve, reject, correct OCR และ reason required
- [ ] `CP-ADMIN-002` E2E announcements: create/edit/publish/unpublish/delete พร้อม image/privacy check
- [ ] `CP-ADMIN-003` E2E data issue: report, triage, resolve, audit trail
- [ ] `CP-ADMIN-004` แสดง cron/provider/notification outbox health แบบอ่านง่าย
- [ ] `CP-ADMIN-005` ทดสอบ forecast candidate/release/rollback permission และ confirmation
- [ ] `CP-ADMIN-006` ทำ pagination/search/loading/error/empty state สำหรับข้อมูลจำนวนมาก
- [ ] `CP-ADMIN-007` ป้องกัน double action และ stale record ด้วย optimistic concurrency/idempotency
- [ ] `CP-ADMIN-008` ตรวจ admin action log, retention และ export สำหรับ incident review
- [ ] `CP-ADMIN-009` ทำ least-privilege role แยก moderator/operator/admin ถ้าการใช้งานจริงมีหลายคน

### เกณฑ์ผ่าน

- Admin browser E2E ผ่านทุก flow สำคัญ
- User role เรียก mutation API ไม่ได้
- ทุก mutation มี actor, time, before/after หรือ reason ที่ตรวจสอบย้อนหลังได้
- rollback forecast/announcement ทดสอบสำเร็จใน staging

## Phase 9 — External forecast reliability และ UX

### เป้าหมาย

ให้พยากรณ์จากภายนอกเป็นบริการหลักที่โปร่งใส ทนต่อ upstream failure และไม่หลอกความมั่นใจ

### งาน

- [ ] `CP-FCAST-EXT-001` ยืนยัน provider contract สำหรับ CAMS/Open-Meteo และ OpenWeather: horizon, issued time, units, attribution, license
- [ ] `CP-FCAST-EXT-002` เก็บ provider snapshot ตาม cron ไม่เรียกทุก provider จาก browser
- [ ] `CP-FCAST-EXT-003` ทำ stale/timeout/rate-limit/circuit-breaker/cache fallback
- [ ] `CP-FCAST-EXT-004` reconcile เวลา/timezone/หน่วย/พิกัด ก่อนเปรียบเทียบ
- [ ] `CP-FCAST-EXT-005` แสดงแนะนำ 1 แหล่งและให้เปรียบเทียบได้ไม่เกิน 3 แหล่ง โดยไม่เฉลี่ยแบบไร้หลักฐาน
- [ ] `CP-FCAST-EXT-006` แสดง issued time, processed time, uncertainty/limited status และสาเหตุข้อมูลจำกัด
- [ ] `CP-FCAST-EXT-007` ประเมิน provider ย้อนหลังเทียบ observation แยก horizon/สถานี/ฤดู/ฝุ่นสูง
- [ ] `CP-FCAST-EXT-008` เลือก recommended source จาก evidence window ไม่ hard-code ยี่ห้อ
- [ ] `CP-FCAST-EXT-009` เปิด GISTDA เฉพาะเมื่อ license/attribution/technical contract ผ่าน owner/legal approval
- [ ] `CP-FCAST-EXT-010` ทดสอบกรณี provider 0/1/2/3 แหล่ง, ค่าต่างกันมาก และข้อมูลหมดอายุ
- [ ] `CP-FCAST-SURF-001` ทดสอบ surface 1/3/6/12/24 ชม. และ `sparse_station_coverage`

### เกณฑ์ผ่าน

- Forecast API ไม่ล้มเมื่อ provider ใด provider หนึ่งล้ม
- UI แยกค่าปัจจุบันกับค่าพยากรณ์ชัดเจน
- recommended source มี evaluation evidence และวันหมดอายุของ evidence
- attribution/license ถูกต้องทุกแหล่งที่เปิดใช้

## Phase 10 — Satellite hotspot และ fire-risk communication

### เป้าหมาย

ยืนยันข้อมูล hotspot จริงและสื่อสารโดยไม่ตีความเกินข้อมูลดาวเทียม

### งาน

- [ ] `CP-FIRE-001` ทดสอบ NASA FIRMS positive fixture และ live positive event เมื่อมีข้อมูล
- [ ] `CP-FIRE-002` กรองเฉพาะขอบเขตนครปฐมและอายุไม่เกิน 12 ชั่วโมง
- [ ] `CP-FIRE-003` ตรวจ duplicate satellite passes, timezone และ coordinate boundary
- [ ] `CP-FIRE-004` แสดงคำว่า “จุดความร้อนจากดาวเทียม” หรือ “satellite hotspot” ทุกจุด
- [ ] `CP-FIRE-005` แยก marker/icon จากสถานีวัดและรายงานบุคคล แต่ใช้สีระดับฝุ่นกับ marker ที่เป็นค่าฝุ่นเท่านั้น
- [ ] `CP-FIRE-006` ทดสอบ alert dedup/quiet hours/area preference ด้วย positive fixture
- [ ] `CP-FIRE-007` เพิ่ม no-data/stale/upstream-unavailable state ที่ไม่เท่ากับ “ไม่มี hotspot”

### เกณฑ์ผ่าน

- Positive fixture ผ่าน API → map → notification → audit log
- ไม่มีข้อความใดระบุว่าเป็นไฟไหม้ยืนยันแล้ว
- “ไม่มีข้อมูล” แยกจาก “ตรวจแล้วไม่พบ” ชัดเจน

## Phase 11 — Mobile UX, accessibility, PWA และ performance

### เป้าหมาย

ทำให้เส้นทางหลักใช้ง่ายบนมือถือจริง ไม่ใช่เพียง responsive screenshot

### งาน UX

- [ ] `CP-UX-001` ทดสอบ 4 งานหลัก: ดูฝุ่นใกล้ฉัน, เลือกสถานี, ส่งรายงาน, ตั้งการแจ้งเตือน
- [ ] `CP-UX-002` ลด cognitive load: primary action หนึ่งอันต่อ section, progressive disclosure และภาษาสั้น
- [ ] `CP-UX-003` ยืนยัน IA: แผนที่ / วันนี้ / ส่งรายงาน / ข่าวสาร; settings รวม preference/configuration
- [ ] `CP-UX-004` ตรวจ bottom sheet, keyboard, safe area, notch, address bar และ orientation
- [ ] `CP-UX-005` ทำ loading skeleton, empty, error, offline, stale และ retry ทุกหน้าหลัก
- [ ] `CP-UX-006` animation 150–250 ms, ลด motion ได้ และไม่บัง feedback สำคัญ
- [ ] `CP-UX-007` ใช้สี 5 ระดับอย่างสม่ำเสมอ พร้อม label/icon เพื่อไม่พึ่งสีอย่างเดียว

### งาน accessibility

- [ ] `CP-A11Y-001` เพิ่ม automated axe ครบ `/settings/notifications`, `/settings/report-problem`, `/privacy`, `/terms`
- [ ] `CP-A11Y-002` ตรวจ keyboard/focus order/focus trap/screen-reader labels/live region
- [ ] `CP-A11Y-003` ตรวจ contrast, text zoom 200%, touch target ≥44px และ landscape
- [ ] `CP-A11Y-004` ทดสอบ VoiceOver iOS และ TalkBack Android อย่างน้อย flow หลัก

### Browser/device matrix

- [ ] `CP-DEVICE-001` Playwright Chromium mobile viewports 360×800, 390×844, 430×932
- [ ] `CP-DEVICE-002` เพิ่ม WebKit สำหรับ Safari-like behavior และ Firefox smoke
- [ ] `CP-DEVICE-003` iPhone Safari จริงอย่างน้อย 1 รุ่น
- [ ] `CP-DEVICE-004` Android Chrome จริงอย่างน้อย 2 ขนาด/ผู้ผลิต
- [ ] `CP-DEVICE-005` Samsung Internet smoke ถ้าเป็นกลุ่มผู้ใช้เป้าหมาย

### Performance/PWA

- [ ] `CP-PERF-001` Lighthouse mobile baseline และ budget ต่อ route
- [ ] `CP-PERF-002` วัด LCP/INP/CLS จาก production RUM โดยขอ consent ตามนโยบาย
- [ ] `CP-PERF-003` ทดสอบ cold start, slow 4G, offline shell, cache update และ stale asset
- [ ] `CP-PERF-004` ทดสอบ map markers/IDW surface จำนวนสูงสุดที่รองรับ
- [ ] `CP-PERF-005` ตรวจ image/font/script preload warning และตัด resource ที่ไม่ใช้

### เกณฑ์ผ่าน

- ไม่มี critical accessibility violation ใน automated + manual flow
- งานหลักสำเร็จบน device matrix โดยไม่มี horizontal overflow หรือ control ถูกบัง
- performance budget ผ่านตามค่าที่ทีมอนุมัติ และไม่มี regression เกิน budget ใน CI
- PWA update/offline/reconnect ไม่ทำข้อมูลผู้ใช้สูญหาย

## Phase 12 — Reliability, monitoring, backup และ cost control

### เป้าหมาย

ตรวจพบปัญหาก่อนผู้ใช้ แจ้งเตือนผู้ดูแลได้ และกู้ระบบกลับมาได้จริง

### งาน

- [ ] `CP-OPS-001` กำหนด SLI/SLO และ error budget สำหรับ API, sync freshness, report success, forecast availability และ notification delivery
- [ ] `CP-OPS-002` structured logs พร้อม request/job/provider correlation ID และ redact secrets/PII
- [ ] `CP-OPS-003` alerts สำหรับ 5xx, readiness fail, stale data, cron miss, provider failure, queue backlog และ notification failure
- [ ] `CP-OPS-004` ตรวจ Vercel function timeout/memory/cold start และ Hobby plan quotas
- [ ] `CP-OPS-005` ตรวจ Supabase database/storage/egress/auth quotas และ retention growth
- [ ] `CP-OPS-006` ตรวจ GitHub scheduled workflow ที่เกิดห่าง 5–6 ชม. ทั้งที่ตั้ง hourly และยืนยันว่าเป็น fallback เท่านั้น
- [ ] `CP-OPS-007` ทำ backup restore drill ลง isolated environment ตาม runbook
- [ ] `CP-OPS-008` วัด RPO/RTO จาก drill และแก้ runbook ตามเวลาจริง
- [ ] `CP-OPS-009` ทำ incident tabletop: Air4Thai down, Supabase down, provider wrong data, secret leak และ false alert
- [ ] `CP-OPS-010` ทำ retention/purge job สำหรับภาพ พิกัด logs และ notification tokens
- [ ] `CP-OPS-011` สร้าง cost dashboard/alerts เพื่อไม่เกิน free-tier โดยไม่ลด safety controls

### SLO candidates ที่ owner ต้องอนุมัติ

- Public API availability ≥99.5% ต่อเดือนภายใต้ข้อจำกัด free tier
- Sync สำเร็จและข้อมูลหลักไม่เกิน canonical freshness threshold ≥95% ของรอบที่มี upstream data
- Report submission success ≥99% เมื่อ camera/GPS permission พร้อม
- Forecast endpoint availability ≥99%; provider status อาจเป็น limited แต่ API ไม่ล้ม
- Critical alert job ไม่พลาดเกิน 1 รอบโดยไม่มี operator notification

### เกณฑ์ผ่าน

- Restore drill สำเร็จและมีหลักฐาน RPO/RTO
- Monitor ตรวจจับ cron miss และ stale data จริง
- Incident runbook มี owner, escalation, communication และ rollback
- มี quota alert ก่อนชน free-tier limit

## Phase 13 — Security, privacy และ abuse resistance

### เป้าหมาย

ป้องกันข้อมูลส่วนบุคคล secret และระบบ moderation จากการใช้ผิดวัตถุประสงค์

### งาน

- [ ] `CP-SEC-101` ตรวจ Supabase RLS ทุก table/view/RPC ด้วย anon/user/admin test matrix
- [ ] `CP-SEC-102` ตรวจ private storage policy และ signed URL expiry
- [ ] `CP-SEC-103` ตรวจ Vercel/Supabase/GitHub secret inventory, rotation owner และ environment scope
- [ ] `CP-SEC-104` rate limit login callbacks, report submit, OCR, gratitude, admin mutations และ notification test
- [ ] `CP-SEC-105` input validation/MIME sniffing/size limits/SQL-RPC authorization
- [ ] `CP-SEC-106` CSRF/state/nonce/open redirect/CORS/security headers review
- [ ] `CP-SEC-107` abuse cases: sybil reports, GPS spoof, replay image, gratitude farming และ notification spam
- [ ] `CP-SEC-108` dependency/SAST/secret scanning ใน CI
- [ ] `CP-PRIV-101` data inventory และ data-flow diagram สำหรับ identity, image, GPS, report, Trust และ tokens
- [ ] `CP-PRIV-102` consent, privacy notice, account deletion/export และ retention behavior
- [ ] `CP-PRIV-103` ตรวจว่า analytics/monitoring ไม่รับ raw GPS/ภาพ/email โดยไม่จำเป็น
- [ ] `CP-SEC-109` ทำ security review และ remediation ก่อน public pilot

### เกณฑ์ผ่าน

- RLS negative tests ยืนยันว่า cross-user/admin data อ่านหรือแก้ไม่ได้
- ไม่มี service-role/private key ใน client bundle, source map หรือ network response
- abuse controls มี tests และ operational visibility
- deletion/retention ทำงานจริง ไม่ใช่เฉพาะข้อความนโยบาย

## Phase 14 — Legal, attribution, health communication และ public pilot

### เป้าหมาย

เปิด pilot อย่างรับผิดชอบ โดยทุกแหล่งข้อมูลและข้อความสุขภาพมีที่มา/สิทธิ์/ผู้อนุมัติ

### งาน

- [ ] `CP-LEGAL-001` เจ้าของระบบตรวจ vendor/DPA inventory และเปลี่ยน Pending เฉพาะรายการที่มีหลักฐาน
- [ ] `CP-LEGAL-002` ยืนยัน terms/license/attribution ของ Air4Thai, OpenWeather, Open-Meteo/CAMS, FIRMS, map tiles, OCR และ LINE
- [ ] `CP-LEGAL-003` ตัด provider ที่ข้อกำหนดไม่อนุญาตให้ cache/redistribute/display ตามรูปแบบปัจจุบัน
- [ ] `CP-HEALTH-001` ตรวจข้อความ 5 ระดับ PM2.5 กับแหล่งอ้างอิงทางการและกลุ่มเปราะบาง
- [ ] `CP-HEALTH-002` เพิ่ม issued/observed time, source และ disclaimer ที่ไม่บดบังข้อมูลหลัก
- [ ] `CP-LEGAL-004` ทบทวน Privacy Policy, Terms, consent และ contact/complaint channel
- [ ] `CP-PILOT-001` pilot แบบ invite-only กับกลุ่มเล็กและพื้นที่จำกัด
- [ ] `CP-PILOT-002` เก็บ task success, report rejection reason, notification usefulness และ user confusion
- [ ] `CP-PILOT-003` ทำ go/no-go review หลัง observation window
- [ ] `CP-PILOT-004` เตรียม rollback message และ status communication ก่อน public launch

### เกณฑ์ผ่าน

- Vendor/license/DPA ไม่มีสถานะคลุมเครือสำหรับบริการที่เปิดใช้
- ข้อความสุขภาพมี owner และ source register
- Pilot ไม่มี P0/P1 incident ค้าง และผู้ใช้ทำ 4 งานหลักสำเร็จตามเป้าหมายที่กำหนด
- Owner ลงนาม go-live checklist

## Phase 15 — Internal ML forecast evidence program

Phase นี้ต่อยอดรายละเอียดจาก
`docs/superpowers/plans/2026-08-03-production-pm25-forecast-plan.md` และไม่ใช่เงื่อนไขสำหรับการใช้ external forecast
ใน production

### เงื่อนไขก่อนเริ่ม

- มีข้อมูลอย่างน้อย 6 observed months และครอบคลุมมากกว่าหนึ่งฤดู
- history ≥90 วัน, source examples ≥1,500, temporal test ≥300 และ ≥3 สถานี
- completeness ≥80% และมี data-quality report
- ไม่มี unresolved leakage/timezone/unit issue

### งาน

- [ ] `CP-ML-001` สร้าง reproducible dataset manifest และ checksum
- [ ] `CP-ML-002` train/evaluate persistence, climatology, damped trend และ candidate model
- [ ] `CP-ML-003` rolling temporal backtest แยก horizon/สถานี/อำเภอ/ฤดู/ฝุ่นสูง
- [ ] `CP-ML-004` calibrate uncertainty และตรวจ interval coverage
- [ ] `CP-ML-005` artifact registry, checksum, schema/version compatibility และ supply-chain checks
- [ ] `CP-ML-006` shadow test 14–30 วันโดยไม่แสดงเป็นค่าหลัก
- [ ] `CP-ML-007` เปรียบเทียบกับ external providers และ deterministic baseline
- [ ] `CP-ML-008` canary เฉพาะเมื่อ MAE ดีขึ้นตาม gate และ category accuracy ไม่ถอยเกินเกณฑ์
- [ ] `CP-ML-009` monitor drift, missing features, inference error และ rollback
- [ ] `CP-ML-010` human approval ก่อนปรับ `ML_FORECAST_ENABLED=true`

### เกณฑ์เปิด ML

- MAE ดีขึ้นจาก persistence ≥5% ใน rolling holdout
- Category accuracy ไม่ลดเกิน 2 percentage points
- ไม่มี station/season subgroup ที่เสื่อมรุนแรงโดยไม่มี mitigation
- uncertainty coverage ผ่านเกณฑ์ที่ประกาศ
- shadow/canary ไม่มี P0/P1 และ rollback drill ผ่าน
- artifact ถูกตรวจ checksum และ provenance

จนกว่าจะผ่านทุกข้อ ให้คง `ML_FORECAST_ENABLED=false`

---

## 7. Test matrix ที่ต้องมีเมื่อจบแผน

| ชั้น                 | ความถี่               | ครอบคลุม                                                           | หลักฐาน                            |
| -------------------- | --------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| Static/unit          | ทุก PR                | format, lint, type, pure policies, contracts                       | GitHub Quality                     |
| Backend integration  | ทุก PR                | routers, DB boundaries แบบ isolated, authz                         | pytest report                      |
| Browser E2E          | ทุก PR                | Chromium mobile + critical flows                                   | Playwright report                  |
| Cross-browser        | nightly/release       | WebKit, Firefox smoke                                              | Playwright artifacts               |
| Provider integration | nightly/staging       | Air4Thai, forecast, weather, FIRMS, OCR mocked + sandbox/live-safe | job log                            |
| Production smoke     | หลัง deploy/ตาม cron  | health, ready, current, forecast, auth callback safety             | timestamped evidence               |
| Real device          | ทุก release candidate | iOS/Android camera, GPS, PWA, push                                 | signed checklist/video/screenshots |
| Field validation     | ก่อน public pilot     | community, Trust, gap-fill, hotspot/alerts                         | field dataset/report               |
| Security/privacy     | release gate          | audit, RLS, secrets, abuse, retention                              | review report                      |
| Resilience           | รายไตรมาส/ก่อน launch | restore, provider outage, rollback, incident                       | drill report                       |

## 8. Release gates

### Gate A — Mergeable

- Quality workflow เขียว
- ไม่มี high/critical dependency vulnerability ที่ยังไม่ได้รับการยอมรับพร้อมเหตุผล
- contract และ migration tests ผ่าน
- code review และ rollback note พร้อม

### Gate B — Deployable to production

- Preview smoke ผ่าน
- migration backward-compatible หรือมี rollback
- production secrets/config validator ผ่านโดยไม่แสดงค่า secret
- monitoring และ feature flags พร้อม

### Gate C — Operational beta

- Google OAuth, report, OCR, Admin และอย่างน้อยหนึ่ง notification channel ผ่าน real integration
- canonical freshness ใช้ตรงกัน
- restore drill ผ่าน
- device matrix ขั้นต่ำผ่าน

### Gate D — Public pilot

- LINE + Web Push หรือช่องทางที่ประกาศว่าเปิดใช้ผ่านจริง
- community field trial และ abuse/privacy review ผ่าน
- legal/license/health sign-off เสร็จ
- incident/on-call/rollback พร้อม

### Gate E — Internal ML production

- ผ่านทุกเกณฑ์ Phase 15
- shadow/canary/evidence window ครบ
- human release approval และ rollback drill ผ่าน

## 9. ลำดับงานแนะนำแบบลงมือจริง

### Sprint 0 — ต้องทำก่อน (P0)

1. `CP-SEC-001` ถึง `CP-SEC-004` — อัปเดต Next.js/sharp อย่างปลอดภัย
2. `CP-CI-001` — แก้ geolocation origin ใน CI
3. `CP-CI-002` ถึง `CP-CI-003` — ทำ Quality workflow ให้เขียว
4. `CP-DATA-001` ถึง `CP-DATA-004` — ทำ freshness contract ให้ตรงกัน
5. `CP-BASE-001` ถึง `CP-BASE-004` — เก็บ baseline และ owner

### Sprint 1 — เส้นทางผู้ใช้หลัก (P1)

1. Google OAuth/session/role production E2E
2. Camera/GPS/OCR/auto moderation บนอุปกรณ์จริง
3. Admin moderation E2E
4. LINE production delivery/dedup
5. Web Push VAPID + installed PWA tests

### Sprint 2 — ข้อมูลเสริมและความน่าเชื่อถือ (P1)

1. Seeded staging + community field trial
2. Trust/corroboration/gratitude/gap-fill validation
3. External forecast reliability/evaluation
4. FIRMS positive-path drill
5. Cross-browser/accessibility/device QA

### Sprint 3 — พร้อมเปิด pilot (P1/P2)

1. Monitoring/SLO/cron alerts
2. Backup restore + incident/rollback drills
3. RLS/security/privacy/abuse review
4. Vendor/license/health sign-off
5. Invite-only pilot และ go/no-go review

### หลังมีข้อมูลเพียงพอ

ดำเนิน Phase 15 ตาม evidence จริง ห้ามเร่งเปิด ML เพื่อให้ดูว่าฟีเจอร์ครบ

## 10. งานที่ AI ทำได้เองเป็นหลัก

- แก้ dependency, CI, tests, contracts และ code/config validation
- เพิ่ม unit/integration/E2E fixtures และ coverage
- refactor pure policies สำหรับ Trust/moderation/forecast selection
- ทำ UI states, accessibility automation และ Playwright matrix
- สร้าง monitoring checks, runbooks, release evidence และ migration scripts
- ทำ seeded staging data ที่ระบุชัดว่าเป็น test data
- วิเคราะห์ production endpoints แบบ read-only และตรวจ logs ที่ได้รับสิทธิ์
- ทำ forecast evaluation/backtest เมื่อมี dataset พร้อม

AI จะไม่สร้างหรือคัดลอก secret ลงเอกสาร/โค้ด และจะไม่เปิด feature เสี่ยงเองโดยไม่มี gate

## 11. งานที่ User/Owner ต้องทำหรืออนุมัติ

1. ยืนยัน Google Cloud/Supabase/Vercel/GitHub owner และ production access
2. สร้าง/หมุน secrets เช่น VAPID และยืนยัน callback/domain ใน console
3. อนุมัติค่า SLO, retention, notification policy และ auto-approval threshold
4. ทดสอบอุปกรณ์จริงและให้ permission กล้อง/GPS/notification
5. จัดเก็บ field reports จากผู้ใช้/อุปกรณ์ต่างกันในพื้นที่จริง
6. ตรวจและอนุมัติ vendor terms, DPA, attribution, privacy และ health communication
7. เป็นผู้ตัดสิน go/no-go สำหรับ public pilot และ ML release
8. ยืนยันผู้รับผิดชอบ incident และช่องทางติดต่อเมื่อระบบแจ้งเตือน

รายละเอียดขั้นตอน owner จะถูกแตกเป็น checklist ในแต่ละ runbook ก่อนถึง phase นั้น เพื่อไม่ให้ต้องจัดการทั้งหมดพร้อมกัน

## 12. Risk register

| ความเสี่ยง                               | โอกาส/ผลกระทบ  | วิธีลดความเสี่ยง                                | Trigger ให้ rollback/หยุด     |
| ---------------------------------------- | -------------- | ----------------------------------------------- | ----------------------------- |
| ข้อมูลสถานีเก่าแต่ UI แสดงเหมือนปัจจุบัน | สูง/สูง        | canonical freshness + stale UI + cron alert     | stale ratio เกินเกณฑ์ 2 รอบ   |
| Dependency vulnerability                 | กลาง/สูงมาก    | patch + audit gate                              | พบ exploitable high/critical  |
| Auto moderation อนุมัติภาพผิด            | กลาง/สูง       | multi-signal + fail closed + audit              | false approval เกิน threshold |
| พิกัด/ตัวตนรั่ว                          | ต่ำ/สูงมาก     | RLS, private bucket, obfuscation, log redaction | พบ public leakage 1 ครั้ง     |
| Provider forecast ขัดกัน                 | สูง/กลาง       | แสดงแยก, evidence ranking, limited state        | divergence สูง/ข้อมูล stale   |
| Notification ซ้ำ/สแปม                    | กลาง/สูง       | idempotency, quiet hours, preference            | duplicate/rate spike          |
| Cron ของ free tier ไม่สม่ำเสมอ           | สูง/สูง        | Supabase primary + backup monitor               | primary miss เกิน 1 รอบ       |
| Restore ไม่ได้                           | ไม่ทราบ/สูงมาก | restore drill และ RPO/RTO                       | drill ล้ม                     |
| Community ถูกปั่น                        | กลาง/สูง       | Trust, corroboration, rate limit, sybil signals | anomaly/complaint spike       |
| ML ดูดีเฉพาะบางฤดู                       | สูง/สูง        | multi-season rolling backtest                   | subgroup regression           |
| ค่าใช้จ่ายเกิน free tier                 | กลาง/กลาง      | quota/cost alerts, cache, retention             | 70/85/95% quota               |
| ข้อกำหนดแหล่งข้อมูลไม่อนุญาต             | กลาง/สูง       | license gate                                    | ไม่มีหลักฐานอนุมัติ           |

## 13. Definition of Done ของระบบ

ClearPath จะถือว่า “พร้อม public pilot” เมื่อ:

1. Gate A–D ผ่านและมีหลักฐานผูกกับ release SHA เดียวกัน
2. CI เขียวและไม่มี known high/critical production vulnerability ค้าง
3. ค่าปัจจุบัน/ความสด/แหล่งที่มาตรงกันทั้ง API และ UI
4. Google login, report, camera, GPS, OCR, moderation และ Admin ผ่าน production-like E2E
5. LINE และ/หรือ Web Push ที่ประกาศว่าเปิดใช้ส่งถึงอุปกรณ์จริงและยกเลิกได้
6. Community Trust/privacy/gap-fill ผ่าน field validation
7. External forecast ทน provider failure และมี evidence ranking
8. Satellite hotspot positive path ผ่านโดยไม่สื่อว่าเป็นไฟไหม้ยืนยันแล้ว
9. Mobile, accessibility, PWA และ performance ผ่าน device/browser matrix
10. Monitoring, cron alert, backup restore, incident และ rollback drill ผ่าน
11. RLS, secrets, abuse, retention, vendor/license/privacy/health review ผ่าน
12. ไม่มี P0/P1 issue ค้าง; P2 ที่ยอมรับต้องมี owner, deadline และ mitigation

ML ไม่ใช่เงื่อนไขของ public pilot หาก external forecast ทำงานตาม Gate D แต่ ML จะถือว่าเสร็จเฉพาะเมื่อ Gate E ผ่าน

## 14. ชุดงานแรกสำหรับ session ถัดไป

เริ่มตามลำดับนี้โดยไม่แตะ feature ใหม่:

1. ตรวจ branch/status และบันทึก baseline ของ Quality run ที่ล้ม
2. อ่าน Next.js migration/security documentation ของรุ่นเป้าหมาย
3. อัปเดต Next.js และ `sharp`
4. แก้ Playwright geolocation origin ให้ใช้ runtime base URL
5. รัน verification suite ทั้งหมด
6. push และยืนยัน GitHub Quality เขียว
7. แก้ freshness semantics พร้อม contract/unit/integration tests
8. deploy แล้วทำ production smoke/evidence ใหม่

หลังจากนั้นจึงเริ่ม Google OAuth และ report/OCR real-device track
