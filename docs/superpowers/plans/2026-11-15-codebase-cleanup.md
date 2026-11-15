# ClearPath — แผนแก้ไขและ refactor codebase ปัจจุบัน

วันที่: 2026-11-15

ฐานที่ตรวจ: `87dcdcf` — working tree สะอาดก่อนเพิ่มเอกสารนี้

สถานะ: implement และตรวจแล้ว ดูผลใน [บันทึก cleanup](../../refactor-2026-11-15.md)

## เป้าหมายและขอบเขต

ปิดช่องเปิดเผยตำแหน่ง แก้ flow ที่ผิดพลาด และทำให้โค้ดอ่านตามหน้าที่ได้ง่าย
สำหรับบำรุงรักษาและนำเสนออาจารย์ ลดโค้ดซ้ำและโค้ดที่ไม่มีผู้ใช้ก่อนลดจำนวนไฟล์
ไม่ตั้งเป้ารวมทุกอย่างเข้าด้วยกันจนเกิดไฟล์ขนาดใหญ่กว่าเดิม

- ระหว่าง implementation ทำเฉพาะ local ตามคำสั่งเดิม; คำสั่งล่าสุดอนุญาต
  test/audit/commit/push/application deploy แล้ว โดยยังไม่ apply database migration
- งานรอบนี้ไม่ต้องเปลี่ยน schema หรือแก้ migration ที่มีอยู่
- รักษา OCR number-only publication, contribution-v3 และคะแนน/settlement รุ่นเก่าที่จำเป็น
- Trust ชุมชนไม่เปลี่ยน XP, IDW หรือ gap-fill; Admin คง read-only
- รักษา Place IDW กับ backend gap-fill เป็นคนละ policy ตาม AGENTS.md
- คง privacy, public coordinate obfuscation, private images และอายุ signed URL
- คงรูปแบบรหัส string, UUID compatibility, signing/deduplication namespaces
- ทุก viewport ใช้ mobile frame สูงสุด 430px และ container queries ตามเดิม
- ไม่ออกแบบหน้าจอใหม่หรือเปลี่ยนสูตรคะแนนระหว่าง refactor

## ข้อมูลตั้งต้น

ผลตรวจรอบล่าสุดที่ revision นี้: backend 3,794 tests และ frontend 548 tests ผ่าน
พร้อม Ruff format/lint, Prettier, ESLint, TypeScript และ production build
ผลนี้เป็น baseline ไม่ใช่หลักฐานว่าบั๊กที่พบถูกแก้แล้ว และไม่ได้รวม E2E รอบใหม่

จุดที่ต้องจัดระเบียบหลัก:

| ไฟล์                                          |  ขนาดปัจจุบัน | ปัญหาที่จะจัดการ                                                  |
| --------------------------------------------- | ------------: | ----------------------------------------------------------------- |
| `frontend/styles/user-app.css`                | 12,594 บรรทัด | มีหลาย refinement layers และ override กระจาย                      |
| `backend/services/community/xp.py`            |  1,081 บรรทัด | account, identity, reads, jobs, rewards และ demo state อยู่รวมกัน |
| `backend/services/store_community.py`         |  1,010 บรรทัด | profile, media, report, engagement และ feed queries รวมกัน        |
| `frontend/components/panels/ReportForm.tsx`   |    853 บรรทัด | draft lifecycle, async submission และ UI อยู่ใน component เดียว   |
| `frontend/components/pages/MapPageClient.tsx` |    749 บรรทัด | ประกอบ UI ควบคู่กับ handlers และ timeline/request transitions     |

ไฟล์ข้อมูลที่ generate เช่น `thailand_boundary.py` ไม่ใช้เป็นเป้าหมาย refactor
เพียงเพราะจำนวนบรรทัดสูง และไม่ลบ tests หรือ migration เพื่อทำตัวเลขให้ลดลง

## ลำดับดำเนินการ

### 1. ปิดช่องอนุมานพิกัดจริง — P1

ไฟล์หลัก: `backend/routers/community.py`, `backend/services/community/presenter.py`,
`backend/services/community/__init__.py`, `backend/services/community/constants.py`
และ tests ที่ระบุ API surface

1. ถอด `GET /api/community/review-queue` ของ workflow peer/star รุ่นเก่าออกจาก runtime
2. ลบ `list_reviewable_reports`, re-export และ `PEER_REVIEW_RADIUS_KM` เมื่อไม่มี caller เหลือ
3. ตรวจ `get_report_reviews` และ helpers ที่เหลือ: ลบเฉพาะเมื่อไม่มี runtime/legacy settlement caller
4. คง `community_trust.review_queue` และ `/api/admin/community-trust/reviews`
   ซึ่งเป็นคิวขอทบทวน Trust ปัจจุบัน คนละ workflow กับ endpoint ที่ถอด
5. ไม่ลบข้อมูล review/audit หรือ migration เดิม

เกณฑ์ตรวจรับ:

- endpoint รุ่นเก่าตอบ 404 และไม่ปรากฏใน OpenAPI
- เส้นทาง public ที่เหลือไม่เปิดให้ใช้รัศมี/ลำดับผลลัพธ์ค้นพิกัดจริงกลับมา
- เพิ่ม regression test ป้องกัน endpoint กลับมา รวมถึง privacy assertions ของ map/history/place selection
- ชุด Trust ปัจจุบันและ Admin read-only ยังผ่าน
- OpenAPI เปลี่ยนเฉพาะ endpoint ที่ตั้งใจถอด ไม่มี retained contract เปลี่ยนโดยไม่จำเป็น

### 2. แก้ lifecycle ของรายงานและภาพ — P2

ไฟล์หลัก: `frontend/hooks/useMapPage.ts`, `frontend/components/app/MapStatusCard.tsx`,
`frontend/lib/api-client.ts` และ hook/component tests

1. ใช้ report ID เป็นตัวระบุ selection แล้ว resolve รายงานจาก snapshot ของโหมดที่เปิดอยู่
   แทนยึด object เก่า; ไม่ใช้ข้อมูลปัจจุบันทับ historical snapshot
2. เก็บ fallback ที่มีบริบทสำหรับรายงานเก่าจาก deep link/request
   โดยคง permission boundary ของ `reportDetail`
3. ใช้ signed URL ใหม่จากข้อมูลที่ refresh; เมื่อ URL หมดอายุหรือโหลดผิดพลาด
   ให้ขอรายละเอียดใหม่แบบจำกัดจำนวนครั้ง ไม่วน retry ไม่สิ้นสุด
4. ถ้าเป็น guest และ endpoint รายละเอียดต้อง login ให้ refresh public source ที่เหมาะสม
   ไม่เพิ่ม public endpoint ที่ขยายสิทธิ์เข้าถึง archived reports
5. ถ้ารายงานถูกถอน/ไม่มีสิทธิ์/ภาพถูก purge ให้แสดงสถานะหลักฐานไม่พร้อม
   ไม่แสดงภาพเก่าต่อด้วย fallback ที่ข้าม authorization
6. กัน stale responses จากการสลับ report, account, tab และ data mode

เกณฑ์ตรวจรับ:

- fake-clock test ผ่านกรณี URL อายุเกิน 5 นาทีและ server คืน URL ชุดใหม่
- ทดสอบภาพ lazy-loaded หลังกลับจากแท็บอื่น, guest, archived request และ historical mode
- การเลือกหมุด/ย้อนกลับ place หรือ stack ไม่เปลี่ยน; การ retry ไม่เพิ่ม network loop
- ไม่เพิ่มอายุ signed URL หรือเปิด bucket เพื่อแก้ปัญหาฝั่ง UI

### 3. แยก publication จาก policy/โบนัสที่ขัดข้อง — P2

ไฟล์หลัก: `backend/services/community/drafts.py`, `automatic_review.py`, `policy_v2.py`,
`presenter.py` และ integration tests ของ submission

1. แยก dependency ที่ต้องมีเพื่อบันทึก/ตรวจสิทธิ์ออกจากการอ่าน eligibility ของ evidence/โบนัส
2. เมื่ออ่าน optional policy ไม่ได้ ให้ OCR-number publication เดินต่อได้
   แต่รายงานสถานะการประเมินเป็น unavailable/pending และไม่ให้สิทธิ์ analytical/bonus โดยเดา
3. ห้าม fallback เป็น v1 เพื่อให้รางวัลแทน v2/v3 ที่อ่านสถานะไม่ได้
   ห้ามกลืนข้อผิดพลาดของการบันทึก report/evidence หลักหรือ authorization
4. เก็บ facts ที่จำเป็นใน draft/evidence เดิม และตรวจให้ worker/retry ที่มีอยู่ประเมินต่อได้
   หาก recovery ต้องใช้ durable state เพิ่ม ให้แยกข้อเสนอ schema ออกจากรอบนี้
5. ส่ง policy snapshot ภายในหนึ่ง operation เพื่อลด repeated reads
   และป้องกัน presentation อ่าน policy ซ้ำจน response ล้มหลัง publication สำเร็จ
6. retry submission ต้องคืน report เดิม ไม่ OCR ใหม่ ไม่เพิ่มรายงานหรือ XP ซ้ำ

เกณฑ์ตรวจรับ:

- จำลอง policy read และ registered-location control ล้มเหลวแยกกัน:
  OCR อ่านได้ต้องได้ final approved; อ่านไม่ได้ต้องได้ final rejected
- ไม่มี pending report ค้างเพราะ dependency สำหรับโบนัส และ response ไม่แจ้งผลสำเร็จผิด
- จำลอง recovery แล้ว eligibility/reward ถูกประเมินตาม policy จริงเพียงครั้งเดียว
- storage/auth failure ยังเป็น error ตามปกติ ไม่มีการแอบข้ามกติกา

### 4. รองรับลิงก์สถานีจากการแจ้งเตือน — P2

ไฟล์หลัก: `frontend/components/app/PersistentMapPage.tsx`,
`frontend/hooks/useMapPage.ts`, `frontend/types/ui.ts` ถ้าต้องมี UI-only type และ tests

1. อ่าน `station` query parameter และส่งเป็น initial selection ให้ map orchestration
2. รอ station data โหลดสำเร็จ แล้วเลือกสถานีและเลื่อนกล้องด้วย motion helper เดิม
3. จัดการการเปิดลิงก์ขณะ map ถูก mount ค้างไว้ และเปิด station ID ใหม่ในแท็บเดิม
4. กำหนดลิงก์ที่ขัดกันให้เลือกเพียงหนึ่ง target: request → report → station
   โดย normalise ที่จุดรับ query; ไม่ให้ effects แข่งกันเลือกคนละหมุด
5. สถานีไม่พบให้มีข้อความที่เข้าใจได้ ไม่ auto-select สถานีอื่น
6. คงรูปแบบ URL ที่ backend และข้อความ LINE ที่ส่งไปแล้วใช้อยู่

เกณฑ์ตรวจรับ:

- hook tests: data มาช้า, ID ไม่พบ, เปลี่ยน ID, เปิดซ้ำ และ target ขัดกัน
- E2E: เปิด `/?station=...` ทั้ง fresh navigation และกลับจากอีกแท็บในแอป
- จับคู่ URL ที่ `air_alerts.notice_for` สร้างกับ frontend parser

### 5. Refactor frontend ตามหน้าที่

ทำหลังข้อ 1–4 ผ่าน เพื่อไม่ผสมการแก้บั๊กกับการย้ายโค้ด
อ่าน guide ของ Next ที่ติดตั้งใน `node_modules/next/dist/docs/` ก่อนเปลี่ยนโค้ด

**Map orchestration**

- ให้ `useMapPage` คงเป็น orchestrator; รวม handlers ที่ทำ transition เดียวกัน
- แยก deep-link resolution และ selection lifecycle เป็น hook เดียวที่ใช้ร่วมกัน
  แทนเพิ่ม hook แยกทีละ query parameter
- ให้ `MapPageClient` เหลือ composition เป็นหลัก; แยก request-flow UI และ
  timeline/selection panel เฉพาะกลุ่มที่มีหน้าที่และ state boundary ชัดเจน
- ใช้ components เดิมก่อนสร้างใหม่ ไม่แยก markup เป็นไฟล์เล็กที่มี caller เดียวโดยไร้ประโยชน์
- รักษา Leaflet instance, map position, CAMS playback, history และ request draft เมื่อสลับแท็บ

**Report form**

- ย้าย draft restore/create/discard/submit และ async cancellation ไป `useReportDraft`
- คง form rendering และ field validation ใกล้ UI; reuse `LocationCard`, `OcrReadingDisplay`
  และ feedback components เดิม
- รักษา camera/gallery provenance, account-scoped memory, idempotency และการเปลี่ยนบัญชี
- ไม่เปลี่ยน OCR policy หรือใช้ Trust/confidence กลับมาเป็น approval gate

**CSS**

- เริ่มจากทำ inventory ของ selector, responsive condition และ source-order overrides
- รวม declarations ที่ซ้ำ/ถูก override ในเงื่อนไขเดียวกัน แล้วค่อยย้ายเป็นกลุ่มโดเมน
- ให้ `user-app.css` เป็น entry ที่อ่านง่าย พร้อม style groups ไม่เกินประมาณ 4–5 กลุ่ม
  เช่น map, pages, community และ settings; ใช้ CSS Modules ที่มีอยู่ต่อ
- รักษาลำดับ cascade; ไม่ย้าย media/container rules แบบอัตโนมัติเพียงจัดตามชื่อ selector
- ลบ selector เมื่อยืนยัน caller ทั้ง TSX, dynamic classes, Leaflet HTML และ E2E แล้ว
- ขนาดไฟล์ลดลงเป็นผลของการลดซ้ำ ไม่ใช่เปลี่ยนชื่อ/ย้ายบรรทัดเพื่อทำตัวเลข

เกณฑ์ตรวจรับ: unit tests ที่ครอบคลุม transitions, E2E และภาพเปรียบเทียบ
320/360/390/430px รวมทั้ง viewport 1280px ที่ยังใช้ frame เดิม
ครอบคลุม keyboard, text enlargement, reduced motion และ forced contrast ตามชุดเดิม

### 6. Refactor backend และ contract

**XP**

- คง `community/xp.py` เป็น stable workflow facade
- แยก account/profile/identity reads เป็นกลุ่มหนึ่ง และ reward/job/claim เป็นอีกกลุ่ม
- แยก demo state/implementation ที่จำเป็นเพื่อตัด circular imports;
  state และ lock ต้องมีเจ้าของเดียว ไม่ copy globals ข้ามโมดูล
- ใช้ `seasons.py`, `compensation.py`, `policy_v3.py` และ pure algorithms เดิม
- รักษา public imports หรือปรับ callers/tests ให้ครบในแต่ละก้อน;
  ไม่สร้าง forwarding wrapper ต่อทุกฟังก์ชัน
- parity tests ต้องครอบคลุม ledger เก่า, v3 reward, reversal, quotas,
  duplicate retry, hidden identity และ monthly leaderboard

**Persistence**

- ตรวจ dependency ของ `store_community.py` ก่อนเลือกแยก
- เป้าหมายคือกลุ่ม report/media lifecycle และ profile/engagement queries ที่อ่านง่าย
  โดย reuse `store_client` และ `supabase_client` facade เดิม
- ย้าย query โดยคง behavior; อย่าให้ query module import presenter/workflow
  จนเกิด circular dependencies
- ลบ read helpers ของ star/review เก่าได้เมื่อพิสูจน์ว่าไม่มี legacy-score caller
- ทดสอบ import แบบ fresh process, identifier compatibility และ query counts

**Contract และ dead code**

- จัด `backend/models/schemas.py` ให้ imports อยู่เป็นกลุ่มและมี `__all__` ชุดเดียว
  ลบ `__all__ += []`; mirror exports กับ `frontend/types/index.ts`
- UI-only types อยู่ `frontend/types/ui.ts` ตามเดิม
- ตรวจ unused exports/config/scripts ด้วย caller search และ tests ก่อนลบ
- เก็บ migration/audit/ledger compatibility; ไม่ถือว่าเก่าแล้วลบได้ทั้งหมด
- README ต้องอธิบาย contribution-v3 และ Trust รุ่นปัจจุบัน;
  แยกเอกสารเก่าที่อธิบาย v2 เป็น historical แทนใช้เป็นคำแนะนำ runtime

## การตรวจรับและส่งมอบ

แต่ละก้อนทำให้ diff review ได้และผ่าน focused regression ก่อนเริ่มก้อนถัดไป
ไม่จำเป็นต้อง commit เพื่อแบ่งก้อนงาน

1. หลังแก้บั๊ก: tests สำหรับช่องพิกัด, image expiry, optional-policy outage และ station links
2. หลังย้ายโมดูล: import/query-count/identity/contract/legacy-XP tests และ frontend transitions
3. หลังปรับ CSS: screenshots เทียบกับ baseline และ mobile E2E ที่เกี่ยวข้อง
4. เมื่อรวมเสร็จ รัน:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit:coverage
npm run build
.venv/bin/python -m ruff format --check backend api scripts
.venv/bin/python -m ruff check backend api scripts
.venv/bin/python -m pytest --cov=backend --cov-report=term-missing --cov-fail-under=80
git diff --check
```

รัน E2E ด้วย local demo servers และ mocked upstreams พร้อม local database rehearsals
ที่สัมพันธ์กับ XP/identifiers; อ่าน script ก่อนรันเพื่อยืนยันว่าไม่เชื่อม remote database
รักษา coverage thresholds เดิม และไม่ลดจำนวน tests ด้วยการลบ retained-feature tests

ส่งมอบเป็น uncommitted working-tree diff พร้อม:

- สรุปไฟล์เพิ่ม/แก้/ลด/ลบ และเหตุผลของแต่ละกลุ่ม
- OpenAPI comparison ที่แสดงการถอด review-queue เท่านั้นสำหรับ public API ที่ตั้งใจเปลี่ยน
- ผลทดสอบ/ภาพเปรียบเทียบ และข้อจำกัดของการตรวจ local
- จำนวน production source files/LOC ก่อนและหลัง โดยแยก tests, generated data และ migrations
- ลำดับอ่านเพื่อนำเสนอ: route → page/hook → API contract → router → workflow → pure algorithm/store

ลำดับสุดท้าย: **privacy → report/image lifecycle → publication resilience → station links
→ frontend refactor → backend/contract cleanup → ตรวจรวมและเอกสาร**
