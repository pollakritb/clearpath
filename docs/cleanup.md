# Cleanup record — 16 November 2026

รายงานฉบับนี้บันทึกรอบก่อนหน้า ดู [recheck รายไฟล์ 17 พฤศจิกายน](codebase-review.md) สำหรับการถอดโค้ดภายในไฟล์เพิ่มเติมและสถานะ migration ล่าสุด

สถานะหลัง audit 17 พฤศจิกายน: เจ้าของอนุญาต release แล้ว ดู [execution record](runbooks/database-completion-progress-2026-11-15.md) สำหรับ migrations/recovery และติดตาม application SHA จาก Git/health endpoint เนื้อหาด้านล่างเป็นประวัติรอบ local cleanup เดิม

## ขอบเขต

งาน OCR/CAMS และ browser-fixture fixes ถูกแยก release ก่อน cleanup (`e3a2426`, Quality CI และ Production smoke ผ่าน) ส่วน cleanup นี้เป็น local working-tree changes เท่านั้น ไม่ commit/push/deploy และไม่ apply database migrations

รักษา feature ปัจจุบัน, API/schema contracts, cron/worker, privacy, legacy score settlement, migration history และ tests ของ feature ที่ยังใช้งาน

## การจัดการ

- ย้ายเอกสาร/ภาพเก่า ชุดวิจัย offline และเครื่องมือทดลองที่ไม่มี runtime/CI caller ออกไป archive ภายนอก
- ย้าย UI/hook ที่มีเฉพาะ tests เรียกออก พร้อม tests เฉพาะของส่วนที่ถอด ไม่ลบ retained-feature tests เพื่อลดจำนวน
- ถอด URL demo ออกจาก application; report generators และรูปจำลองอยู่ใน browser fixtures เท่านั้น
- ลบ API-client wrappers, helpers และ CSS selector branches ที่ยืนยันว่าไม่มีผู้เรียก โดยคง HTTP endpoints และ contracts
- แยกคู่มือนำเสนอและสถาปัตยกรรมปัจจุบันออกจากเอกสารย้อนหลัง

## Archive และการคืนงาน

Archive อยู่ภายนอก ClearPath ภายใต้ `../ClearPath-archive/` โดยโฟลเดอร์รอบนี้ระบุใน local inventory และรายงานส่งมอบ ประกอบด้วย:

- `baseline-*.tar.gz`: tracked source ก่อน cleanup สำหรับคืน dependency ของชุดวิจัยให้ครบ
- `removed/`: ไฟล์ที่นำออก เก็บ relative path เดิม
- `prepared-removals.json` และ inventory: SHA-256, ขนาด และเหตุผลของแต่ละไฟล์
- `pending-before-release/`: สำเนางานค้างจากก่อน release; ไม่ใช่สิ่งทดแทน recoverable production database backup
- `visual-before/` และผลตรวจหลัง cleanup

คืนไฟล์จาก `removed/` ตาม relative path เดิมและตรวจ SHA-256 กับ manifest อย่า overlay baseline ทั้งก้อนทับงานใหม่โดยไม่ review diff

ลิงก์ประวัติจากเอกสารปัจจุบันชี้มาที่หน้านี้เพื่อไม่ให้ repository อ้างถึงไฟล์ที่นำออกไปแล้ว ชื่อ/พาธเดิมค้นได้ใน external inventory หรือ Git history

## งานที่คงไว้โดยตั้งใจ

- Migrations และข้อมูล audit/ledger เดิมไม่ใช่ dead code
- Backend demo และ test fixtures ที่ CI ต้องใช้ยังอยู่
- Geometry ที่ generate, metadata icons, vendor source/licenses และ worker dependencies ยังมี consumer จริง
- API ที่ไม่ได้มีปุ่มบน UI อาจเป็น contract หรือ operational boundary จึงไม่ลบจากการนับ frontend calls เพียงอย่างเดียว
- ไฟล์งานฐานข้อมูลที่ยังค้างและไม่ commit อยู่นอกขอบเขต cleanup และคงเนื้อหาเดิม

## ผลตรวจ

ตรวจจาก isolated cleanup workspace ก่อนนำกลับเข้ามา โดยไม่ลด coverage thresholds หรือเพิ่ม test skips เพื่อให้ผ่าน

- ตรวจ inventory ของ tracked files ทุกไฟล์: คงไว้ 801, แก้ 52, นำออก 162 และเพิ่มไฟล์ปัจจุบัน/fixtures 6 ไฟล์
- Production source files 431 → 419; production LOC 71,061 → 68,412 (app/frontend/backend/api ไม่รวม tests)
- ลบ CSS selector branches ที่ไม่มี consumer 171 branches และ keyframe ที่ไม่มีผู้ใช้ 1 ชุด โดยรักษาลำดับ cascade
- Backend: 3,799 tests ผ่าน; coverage 81.38% (gate 80%)
- Frontend: 598 tests ผ่าน; lines 94.94%, statements 93.68%, functions 91.86%, branches 88.41% (gates เดิม 90/90/90/85)
- OpenAPI 97 paths และ components เท่ากับ baseline ทุก field
- ภาพก่อน–หลัง 16 ภาพที่ 320/360/430/1280px เหมือนกันทุก pixel
- Production build แบบปิด demo/proxy: ผ่านจาก source snapshot แยก
- Local SQL regression 15 ชุดผ่านครบ ไม่ apply hosted migrations
- Browser suite หลัก: 551 passed, 32 intentional skips และ 3 assertion failures ในกลุ่ม report-stack; แก้การรอ avatar/layout และการวัด scroll เทียบ panel แล้วตรวจกลุ่มที่กระทบซ้ำผ่านทุก viewport (ไม่ได้ rerun ทั้ง suite อีกรอบหลังแก้ assertions)
- ครอบคลุม 554 active browser cases หลังตรวจแก้; local stress 1,000 request paths ผ่านครบ 40 batches ใน 4 viewport
- Final sync กลับเข้า workspace ใช้ exact source manifest และตรวจ hash งานค้าง โดยคง cleanup เป็น unstaged local changes

Test count ที่ลดลงมาจาก tests เฉพาะ UI/เครื่องมือ offline ที่ย้ายออก โดย tests เหล่านั้นและ baseline source อยู่ใน archive ไม่มีการถอด tests ของ feature ที่เก็บไว้

Data fixture `backend/data/demo-stations.csv` และ `e2e/fixtures/report-evidence.png` เป็นข้อมูลเดิมที่มี caller ใน demo/tests จึงย้ายจากเอกสารเก่ามาไว้ข้าง consumer; ตรวจเนื้อหาตรงกับต้นฉบับ

## ส่งมอบในเครื่อง

นำ reviewed cleanup กลับเข้า ClearPath แล้ว โดย Git HEAD คง `e3a2426` และ index ว่าง งาน cleanup ไม่ถูก commit/push/deploy งานฐานข้อมูลค้าง 9 ไฟล์มี SHA-256 เดิมครบ

ย้าย local artifacts 27 กลุ่ม รวม 7,584 ไฟล์/symlinks ประมาณ 519 MiB ไป archive ภายนอก พร้อม manifest และตรวจ hash หลังย้าย คง credentials, `.git`, `node_modules`, `.venv` และ live build directories ที่อาจมีเซิร์ฟเวอร์ใช้อยู่ เฉพาะ QA servers ของรอบนี้ถูกปิด
