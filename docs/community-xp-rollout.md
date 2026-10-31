# เปิดใช้ community XP

การ deploy โค้ดและเพิ่ม schema/cron แยกจากการล้างข้อมูลและเปิดแจก XP บน production โดยการเพิ่ม schema ไม่ลบข้อมูล และ DB control จะยังปิดการแจกคะแนนจนผ่านขั้นเปิดใช้งานที่อนุมัติแยก

## ตรวจ local

```sh
uvicorn backend.main:app --reload --port 8000
npm run dev
```

ใช้ local demo เพื่อดู `/profile` → อันดับชุมชน หรือ `/leaderboard` โดยตรง โหมด demo เก็บ XP ใน process สำหรับ QA เท่านั้น ข้อมูลจริงใช้ Supabase

```sh
node scripts/test-community-xp.mjs
.venv/bin/python -m pytest backend/tests/test_community_xp*.py
npm run test:unit
npm run format:check
npm run lint
npm run typecheck
npm run build
```

## เตรียม staging ก่อน

1. Review และ apply `20261030213750_community_xp.sql` ใน staging ก่อน มีแต่การเพิ่ม schema/trigger **ไม่มี reset/backfill**
2. ตั้ง `COMMUNITY_XP_ENABLED=true` ใน backend เพื่อให้รองรับ control; DB เริ่ม `enabled=false` จึงยังไม่แจก XP และปุ่มช่วยรายงานเดิมยังใช้ได้
3. เปิด DB control ใน staging เมื่อต้องทดสอบการให้คะแนน แล้วตรวจ end-to-end กับ camera/gallery/GPS บน Safari จริง
4. ทำการทดสอบ restore ข้อมูลและรูปใน staging ที่ว่างและเป็น project คนละตัวกับต้นฉบับ

## Backup และการอนุมัติ reset

เครื่องมือ `scripts/community_xp_reset.py` ต้องใช้ `SUPABASE_ACCESS_TOKEN` ที่จำกัดสิทธิ์ project สำหรับ Management SQL และ `SUPABASE_SERVICE_ROLE_KEY` ของ project ที่เลือกสำหรับ private Storage ทั้งสองเป็น server/operator เท่านั้น ห้ามส่งไป browser หรือ commit ค่า

ใช้ `--project` ให้ชัดเจนทุกครั้ง ไฟล์ key ต้องเก็บคนละที่กับ archive ตัวอย่างใช้ project placeholder:

```sh
.venv/bin/python scripts/community_xp_reset.py key --key-file /safe/place/community-xp.key
.venv/bin/python scripts/community_xp_reset.py inventory --project PROJECT_REF --key-file /safe/place/community-xp.key
.venv/bin/python scripts/community_xp_reset.py backup --project PROJECT_REF --archive .community-reset-backups/launch.cpxp --key-file /safe/place/community-xp.key
.venv/bin/python scripts/community_xp_reset.py verify --archive .community-reset-backups/launch.cpxp --key-file /safe/place/community-xp.key
```

Archive เข้ารหัสทุก record พร้อม chain/checksum ตรวจครบทั้ง database snapshot และรูปใน private bucket รวม orphan uploads Snapshot ฐานข้อมูลเป็นคำสั่งอ่านครั้งเดียวเพื่อให้เป็นชุดเดียวกัน และเก็บ fingerprint ของขอบเขตแต่ละตาราง

Restore ใช้ project ว่างต่างจากต้นฉบับและมี schema ครบ สร้าง Auth stub เฉพาะใน staging เพื่อรองรับ FK โดยไม่คัดลอก Google credentials เครื่องมือตรวจ row fingerprints และรูปที่คืนแล้วจึงเขียน proof:

```sh
.venv/bin/python scripts/community_xp_reset.py restore-staging --project STAGING_REF --archive .community-reset-backups/launch.cpxp --key-file /safe/place/community-xp.key --restore-proof .community-reset-backups/restore-proof.json --approval 'RESTORE STAGING_REF MANIFEST_SHA256'
```

หาก staging มีบัญชี/ข้อมูลหรือ trigger ที่ทำให้ snapshot แตกต่าง ให้แก้ใน staging และทดสอบใหม่ ห้ามข้ามการตรวจ proof ห้ามทดสอบ restore ทับ production

ก่อนขออนุมัติ แสดง project, จำนวนแถว, จำนวนรูป, fingerprint/manifest SHA, ผล restore และอายุ backup ให้ผู้ใช้ตรวจ **คำสั่ง commit/push/deploy ไม่ใช่การอนุมัติล้างข้อมูล**

## Reset production หลังอนุมัติเฉพาะชุด

1. Apply migration ที่ตรวจแล้วและ deploy code รองรับ control ก่อน ตั้ง `COMMUNITY_XP_ENABLED=true` แต่ DB control ยัง disabled
2. หยุด cron ชุมชน/การส่งแจ้งเตือนที่เกี่ยวข้อง และรอ worker เดิมจบก่อนล้าง Official Air4Thai/CAMS ingestion ไม่ถูกหยุด
3. เรียก reset ด้วยข้อความอนุมัติที่ผูก project และ SHA ของ archive จริงเท่านั้น:

```sh
.venv/bin/python scripts/community_xp_reset.py reset --project PROJECT_REF --archive .community-reset-backups/launch.cpxp --key-file /safe/place/community-xp.key --restore-proof .community-reset-backups/restore-proof.json --approval 'RESET PROJECT_REF MANIFEST_SHA256'
```

เครื่องมือเปิด maintenance, lock ตาราง, ตรวจ fingerprint ตรง backup แล้วล้างใน transaction ตาม FK ไม่มี DROP/TRUNCATE ถ้าข้อมูลเปลี่ยนจาก backup จะหยุดและคง maintenance: ทำ backup/restore/อนุมัติชุดใหม่ ห้ามฝืนใช้ SHA เก่า

หลัง DB reset จะลบเฉพาะรูปตาม manifest หาก Storage ล้มเหลวให้รันชุดเดิมซ้ำโดยยังคง maintenance; ตัวชี้ reset_manifest ป้องกันล้าง DB ซ้ำ ไม่มีการเปิดรับใหม่อัตโนมัติ

ล้างรายงาน/draft/evidence/ภาพ/ปฏิกิริยา/ความคิดเห็น/คำขอ/notification ที่เกี่ยวข้อง/คะแนนเดิมและใหม่/ตัวนับเดิม/พิกัด presence โดยเก็บ Auth บทบาท การตั้งค่าอื่น และ helper consent แต่ต้องรับ GPS ใหม่

เก็บสถานี Air4Thai ประวัติค่าตรวจวัด CAMS/พยากรณ์ ข่าวสาร notification ที่ไม่เกี่ยวข้อง และ security audit ที่ไม่เกี่ยวกับผลงานชุมชน

4. ตรวจ row counts, orphan jobs, private Storage และ reset version อีกครั้ง แล้ว review/install `scripts/sql/community_xp_scheduler.sql` ใช้ cron ชื่อเดิมเมื่อรันซ้ำ ไม่สร้างงานชื่อสุ่ม
5. เปิด control หลังผ่านการตรวจ:

```sql
update public.community_xp_control set enabled=true, maintenance=false;
```

6. เปิด cron ชุมชนกลับ ตรวจรายงานใหม่ได้ 10 XP, ผู้ช่วยได้รวม 15 XP, อันดับ/ยศ/anonymous privacy และตัวกรอง 7/30 วัน
7. ตรวจ pending jobs และ metrics ผ่าน Admin และ `/api/community/xp/admin`; ห้ามให้ Admin กลับมาตัดสินอนุมัติรายงาน
8. ลบ archive และข้อมูลที่ restore ใน staging ภายใน 7 วันตาม `delete_backup_after` ใน manifest และนโยบาย operator อย่าเก็บกองสำรองชุมชนตลอดไป

Global control cache มีอายุสูงสุด 2 วินาที; DB triggers ป้องกัน writes ซ้อนระหว่าง maintenance โดยตรง การเปลี่ยน reset version ให้ client เคลียร์ selection ของรายงาน/คำขอเมื่อรับ snapshot ใหม่

หาก rollback แอป ให้ปิด `enabled` ก่อน แต่เก็บ ledger ไว้ ไม่มีการ reset คะแนนอัตโนมัติจาก deploy หรือการเปิด/ปิด feature

เครื่องมือลบ backup ตามอายุ (ตั้งให้รันรายวันในเครื่อง/ระบบสำรองที่ดูแลไฟล์จริง ไม่ต้องใช้ production API token):

```sh
.venv/bin/python scripts/community_xp_reset.py prune-backups --project PROJECT_REF --archive .community-reset-backups --key-file /safe/place/community-xp.key
```

คำสั่งนี้ตรวจลายเซ็น/expiry ของไฟล์ `.cpxp` ก่อนลบ และลบเฉพาะ project ที่ระบุ ไม่ลบ key, archive ใหม่ หรือข้อมูลบน Supabase ต้องกำหนด job นี้ตอนสร้าง backup จริง และกำหนดอายุข้อมูลที่ restore ใน staging ด้วย
