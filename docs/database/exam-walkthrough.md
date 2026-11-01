# ClearPath — แนวตรวจฐานข้อมูลสำหรับสอบ

สถานะฐานข้อมูลใหม่: `ClearPath_Final` ใช้ numeric PK/FK และ generated code แล้ว และ schema รุ่น 3 ไม่มีคอลัมน์ `legacy_*` ใน public ตรวจ ID 23 ประเภทและความสัมพันธ์ 50 จุดผ่าน (ก่อนถอดตารางโมเดลที่ว่าง 3 ตาราง; ความสัมพันธ์ ID entity ยังคงเดิม) พร้อมข้อมูลสถานี/ประวัติ 3 วันและบัญชีผู้ใช้เริ่มใหม่. ดู [การย้ายโปรเจกต์และหลักฐานตรวจ](../runbooks/fresh-project-2026-11-01.md). โปรเจกต์เดิมยังเป็น incident แยกต่างหาก; ตัวอย่าง expand ด้านล่างอธิบายวิธีย้าย schema เดิม.

ใช้ [data dictionary](data-dictionary.md) ควบคู่ [ERD](erd.mmd). Schema ปัจจุบันมี 41 ตาราง: ข้อมูลสถานี/อากาศ, CAMS, ชุมชน, คำขอวัด, การแจ้งเตือน และ XP.

## อธิบายการออกแบบ ID

ตัวเลขฐานข้อมูล เช่น `1` มีไว้ join/index. รหัส `RPT-000001` มีไว้ให้คนอ้างอิงรายงานได้ตรงกัน. UUID ของ Supabase Auth มีไว้เชื่อมผู้ใช้เข้าสู่ระบบ. Token กล้อง, lease token, signature และ idempotency key มีหน้าที่ด้านความปลอดภัยหรือป้องกันการทำงานซ้ำ จึงต้องคงรูปแบบ opaque.

ในระยะ expand UUID ยังเป็น PK/FK เดิม และเพิ่ม numeric identity, code และ shadow FK. ขั้น cutover จึงจะย้ายตัวเลขมาเป็น PK/FK และให้ API ส่งรหัสอ่านง่ายใน string fields. การมี code เพิ่มแล้วไม่เท่ากับย้าย PK เสร็จแล้ว.

รหัสอาจข้ามเลขได้เมื่อ transaction rollback หรือรายการถูกลบ. รหัสไม่เปลี่ยนทุกปีและไม่ใช้ `MAX(id)+1`. เช่น เลขหนึ่งล้านต้องเป็น `RPT-1000000` โดยไม่ถูกตัดเหลือหกหลัก.

## เริ่มจากข้อมูลจำลอง

รัน rehearsal ที่ไม่ใช้ credential และไม่เรียก production:

```sh
npm run test:identifiers:db
npm run test:identifiers:cutover
```

Fixture สร้างเฉพาะ schema ของระบบและข้อมูล dummy ภายใน PGlite. ไม่มีชื่อผู้ใช้จริง พิกัดจริง รูป หรือ LINE ID. ชุดตรวจพิสูจน์ chronological backfill, การคงค่าทุกคอลัมน์เดิม, การ sync FK, การเก็บ alias หลังลบ, รหัสเกินหกหลัก และการปฏิเสธสิทธิ์ anon/authenticated.

ชุด cutover ตรวจ numeric PK/FK, legacy aliases, retry/deduplication, RPC, RLS และการรักษา opaque tokens เพิ่มเติม. การทดสอบ local ไม่ยืนยันสถานะ production.

## ดูความสัมพันธ์หลัง apply expansion

ใช้ SQL editor ด้วยสิทธิ์ผู้ดูแล. Query ต่อไปนี้เป็น read-only. `review` ไม่ควรถูกเพิ่มใน exposed schemas ของ Data API.

```sql
select code, user_code, status, pm25, captured_at
from review.community_reports
order by code;

select code, report_code, user_code, kind, points, reason
from review.community_xp_events
order by code;

select code, sync_run_code, station_id, provider, forecast_at
from review.forecast_provider_snapshots
order by code
limit 20;

select code, generation_code, status, next_batch, batch_count
from review.cams_grid_jobs
order by code;
```

ชี้ให้เห็นว่า report เชื่อมผู้ส่ง, session กล้อง, evidence, review และ XP. คำขอวัดเชื่อมผู้ขอ ผู้รับคำเชิญ รายงานผลและ notification. CAMS แยก job, generation, frame และ active pointer เพื่อเผยแพร่ข้อมูลครบชุดพร้อมกัน.

## อธิบายข้อกำหนดของ feature ปัจจุบัน

- OCR อ่านตัวเลขได้ให้เผยแพร่ทันที; อ่านไม่ได้ให้ rejected และถ่ายใหม่. Admin ตรวจ log ได้แต่ไม่อนุมัติ/ปฏิเสธรายงาน.
- คะแนน XP เป็นการมีส่วนร่วม แยกจาก Trust ที่ใช้กับคุณภาพข้อมูลและ IDW.
- พิกัดจริงและหลักฐานภาพเป็น private. หมุดสาธารณะต้องรักษาการ obfuscation เดิมระหว่างย้าย ID.
- สมาชิกสาธารณะใช้ MBR แยกจาก USR. รหัสที่เดาได้ไม่ใช่สิทธิ์เข้าถึงข้อมูลของผู้อื่น.
- Feature เส้นทางและตาราง forecast รุ่นที่เลิกใช้แล้วไม่อยู่ใน schema ปัจจุบัน.

## สิ่งที่ต้องผ่านก่อนสลับ PK/FK

1. เก็บ backup ที่ restore ได้ของฐานข้อมูลและ private storage metadata พร้อม rehearsal และ checksum.
2. Release resolver ที่รับ code/UUID เก่า, auth UUID → profile numeric ID, capture token/signature รุ่นเดิม และ image URL เดิม.
3. ปรับ Pydantic/TypeScript, local demo, caches, pagination/cursors, JSON references และ worker ทุกตัว. BIGINT ออก API เป็น code string.
4. พิสูจน์ retry ไม่สร้างรายงาน, notification หรือ XP ซ้ำ; รักษา deduplication namespace เก่าและ public pin เดิม.
5. หยุด writes/cron/in-flight workers ชั่วคราว, ตรวจ delta, สลับ PK/FK/RPC/RLS, แล้วตรวจจำนวนข้อมูล ความสัมพันธ์และสิทธิ์ก่อนเปิด writes.
6. ก่อนเปิด writes rollback ได้ด้วย transaction/backup ที่ตรวจแล้ว. หลังเปิด writes ต้อง forward fix ห้ามนำ backup เก่าทับข้อมูลใหม่.

Expansion SQL ไม่ได้ทำขั้นตอน cutover ข้างต้นและไม่ควรถูกเสนอว่าเป็น migration ที่จบครบแล้ว.
