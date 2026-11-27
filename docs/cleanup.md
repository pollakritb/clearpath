# Cleanup สำหรับส่งตรวจ source — 27 พฤศจิกายน 2026

เริ่ม cleanup เฉพาะในเครื่อง ต่อมาเจ้าของสั่ง verify/recheck/commit/push/deploy เมื่อ 28 พฤศจิกายน 2026; การปล่อยแอปไม่แก้ฐานข้อมูลหรือ replay migrations

## ขอบเขตที่เก็บไว้

- `app/`, `frontend/` และ `backend/`: โค้ดระบบปัจจุบัน
- Unit/integration/browser tests และ fixtures ของระบบที่ยังใช้งาน
- `supabase/`: schema, migrations และข้อมูล bootstrap ที่จำเป็นต่อการสร้างระบบ
- `deploy/`, `.github/` และ `scripts/`: deployment, CI, schedulers และเครื่องมือกู้คืน/ดูแลระบบที่ยังใช้
- Lockfiles, `.env.example`, ข้อมูล geometry, demo fixtures และ vendor licenses
- README, สถาปัตยกรรม, คู่มือนำเสนอ และ runbooks ปัจจุบัน รวมถึง execution record ของ migrations/recovery

โค้ด settlement/ledger เดิม, migration history และ audit retention ยังจำเป็นต่อข้อมูลที่มีอยู่ จึงไม่ตัดออกเพียงเพราะชื่อมีคำว่า legacy หรือไม่มีปุ่มใน UI

## ไฟล์ที่ย้ายออก

- รายงาน audit รายไฟล์/ตารางฐานข้อมูลและแผนงานย้อนหลังที่ไม่ใช่คู่มือปัจจุบัน
- เอกสาร nearest-pin รุ่นเก่าและการทดลอง retired hosted LINE daemon ที่นโยบายปัจจุบันแทนที่แล้ว
- Workflow/script หยุดการทดลอง LINE เดือนพฤศจิกายน ซึ่งไม่ใช่ VPS worker ปัจจุบัน
- Tool-specific interface configuration และ `CLAUDE.md` ที่มีเพียงการอ้างกลับ `AGENTS.md`
- ภาพ/ผล browser QA, snapshots, แคช Python/TypeScript และ build directory เก่า `.next-dev`
- ไฟล์ credentials สำหรับ operations `.env.deploy.local` และ `.env.target.local`; เก็บสำเนานอกโปรเจกต์ ไม่รวมในการส่งงาน

ปรับลิงก์เอกสารและ ignore rules ให้สอดคล้องกับโครงสร้างที่เหลือ ส่วน dependencies (`node_modules`, `.venv`), `.git`, `.env.local` และ `.next` ที่ local server ใช้อยู่คงไว้และไม่อยู่ในรายการส่ง GitHub

## Archive และการคืนไฟล์

Archive ของรอบนี้อยู่ภายนอก repository:

```text
../ClearPath-archive/submission-cleanup-20261127-233621/
  source-before.tar.gz
  removed/
  manifest.json
```

ย้าย 35 กลุ่ม รวม 721 ไฟล์/symlinks ประมาณ 114.6 MiB พร้อมตรวจ SHA-256 หลังย้าย โดย archive มีสิทธิ์เข้าถึงเฉพาะเจ้าของ เพราะมี private operations config รวมอยู่ด้วย ห้ามนำ archive นี้ขึ้น GitHub

`source-before.tar.gz` เก็บ tracked source ที่ commit `c3a1aee` ก่อน cleanup ส่วน `removed/` เก็บ relative path เดิมและ `manifest.json` เก็บขนาด/hash คืนเฉพาะไฟล์ที่ต้องการตาม path เดิมแล้วตรวจ hash ไม่ overlay source เก่าทั้งชุดทับโค้ดปัจจุบัน

รอบ cleanup ก่อนหน้านี้เก็บใน `../ClearPath-archive/` เช่นกัน รายงานเก่าและผลตรวจของรอบนั้นเป็นหลักฐานย้อนหลัง ไม่ใช่ผลตรวจของ source ปัจจุบัน

## การส่งงาน

ส่งเฉพาะไฟล์ที่ Git track และ local changes ที่ review แล้ว ไม่แนบ archive, credentials, dependencies, caches หรือผลทดสอบที่ generate ใหม่ ใช้คำสั่งตรวจงานใน [README](../README.md#ตรวจงาน) และดู [คู่มือนำเสนอ](presentation.md) สำหรับลำดับอธิบายระบบ

ผล checks ในเครื่องไม่ทดแทนผล GitHub Actions; workflow `Quality` ของ commit `c3a1aee` มีรายงาน backend ไม่ผ่านและต้องตรวจสาเหตุแยกจากงาน cleanup นี้

## ผลตรวจรอบนี้

- Prettier format check, ESLint และ TypeScript typecheck ผ่าน
- Ruff format/check และ backend pytest ทั้งชุดผ่าน
- ตรวจลิงก์ Markdown ใน README/docs 33 ไฟล์ ไม่พบปลายทางไฟล์ที่หาย
- ตรวจ tracked source ที่เหลือ 878 ไฟล์ ไม่พบค่าลับ production ที่ตั้งใช้อยู่หรือ private-key headers
- คง CA certificate ที่ Air4Thai ใช้ตรวจ TLS ไว้; ไฟล์ `.pem` นี้ไม่ใช่ private key
- ไม่ได้รัน production build, browser suite หรือแก้สาเหตุ GitHub Actions ในงาน cleanup รอบนี้

## Current-code review — 28 พฤศจิกายน 2026

- ใช้ `https://clearpath.plotpop.tech` เป็น default public origin ใน config/template; Google News ใช้ origin ที่ตั้งไว้
- ถอด service helpers สำหรับ nearest-only selection, episode repair และ daily-limit state ที่ไม่มี runtime caller
- ถอด quiet-window exception/handlers ที่ไม่มี producer; ทดสอบว่าค่าชั่วโมงพักส่งเดิมไม่บล็อกการส่งปัจจุบัน
- ย้าย polygon พื้นที่ทดลองนครปฐมไป `backend/tests/fixtures/province_area.py` โดยเก็บ attribution และ regression tests ไว้
- นำ workflow เก็บ CAMS บน hosting เดิม ที่ถูกแทนด้วย VPS scheduler ออก เก็บใน archive `../ClearPath-archive/code-refresh-20261127-235554/`
- ปรับคำอธิบาย CAMS single-grid, worker, feature flags และ audit-only v2 policy ให้ตรงกับผู้เรียกปัจจุบัน
- คง API compatibility responses, retained audit/migrations และ XP settlements ที่ยังจำเป็น
- OCR default ใช้ `gpt-5.6-sol`; `.env.example` มีเฉพาะ ASCII `KEY=value`

ผลตรวจหลังแก้: backend coverage 82.02% (เกณฑ์ 80%), frontend unit tests 614 ผ่านและ coverage ผ่านเกณฑ์เดิม, format/lint/typecheck/Ruff ผ่าน ลิงก์เอกสารไม่หาย ผลตรวจนี้เป็นของรอบ local; ดู recheck ก่อน release ด้านล่าง

## Recheck ก่อน release — 28 พฤศจิกายน 2026

- ถอด hosting config/entrypoint, worker image ซ้ำ, release metadata และคำแนะนำของ platform เดิมออก ใช้ VPS/Uvicorn entrypoint เดียว
- ย้าย LINE worker เข้า Compose ของ VPS โดยตรง เปิดด้วย `COMPOSE_PROFILES=line`
- แก้ LINE security tests สองตัวให้กำหนด demo mode เอง ไม่พึ่ง `.env.local` ที่ไม่มีบน CI
- ทดสอบ backend โดยตั้ง `LOCAL_DEMO_MODE=false`: ผ่านทั้งชุดและ coverage 81.97%
- Frontend unit tests 614 ผ่าน, browser notification tests 9 ผ่าน, SQL rehearsals 18 คำสั่งผ่าน
- Format/lint/typecheck/Ruff, dependency checks และ audits ผ่าน
- Model access check ด้วย production key: `gpt-5.6-sol` ตอบ 200; ใช้ชื่อนี้แทน alias ที่ key ไม่รู้จัก
- Credentials และ archive คงอยู่นอก Git; ไม่มี database migration ใหม่ใน release นี้
