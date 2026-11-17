# แผนจัดฐานข้อมูล ClearPath ให้เรียบร้อย

วันที่จัดทำ: 15 พฤศจิกายน 2026 · สถานะ: apply เฉพาะสอง migrations ที่ review/rehearse แล้ว; ส่วน cutover/retirement/backfill ยังคงเป็นแผน

ขอบเขตล่าสุด 17 พฤศจิกายน 2026: เจ้าของอนุญาต test/commit/push/deploy/apply migration แล้ว ขั้น recovery/capacity และ migrations เฉพาะ CAMS retention delta กับ operational references ผ่านและ apply แล้ว ดู [execution record](../../runbooks/database-completion-progress-2026-11-15.md) ส่วน cutover/retirement/backfill/flags และบริการเสียเงินยังไม่ได้รับการขยายขอบเขต

## เป้าหมายและขอบเขต

ทำให้ฐานข้อมูลดูแลต่อได้ กู้คืนได้ ใช้พื้นที่อย่างมีขอบเขต และอธิบายให้อาจารย์/กรรมการได้ โดยรักษาข้อมูลผู้ใช้ ความเป็นส่วนตัว Trust/XP และบริการปัจจุบัน ยึด Supabase Free และไม่เพิ่มบริการเสียเงิน

### ข้อกำหนดพื้นที่จากเจ้าของ — 15 พฤศจิกายน 2026

- Backup ต้องดาวน์โหลด/stream จากฐานข้อมูลและ Storage มาเก็บบน Mac เครื่องนี้เท่านั้น ปลายทางคือ `~/Library/Application Support/ClearPath/Backups/` นอก repository ไม่อัปโหลดสำเนากลับไป Supabase
- ห้ามสร้าง backup table/schema, `CREATE TABLE AS SELECT`, materialized copy, hosted clone/branch/project หรือ replication slot เพื่อสำรองข้อมูล และไม่สั่งสร้าง hosted backup เพิ่ม
- ทดสอบ restore เฉพาะ PostgreSQL/Storage fixture บน Mac เครื่องนี้ ไม่ restore สำเนาลง Supabase แม้เป็นอีกโปรเจกต์แบบ Free
- ก่อน export ตรวจพื้นที่ Mac ให้พอสำหรับไฟล์สำรอง การแตกไฟล์ และฐานข้อมูลทดสอบ; จำกัด concurrent reads, เวลารัน และติดตามผลกระทบ ไม่เปิด transaction สำรองค้างยาวจนกีดขวาง vacuum หรือทำให้ WAL/พื้นที่โต
- ก่อน mutation ประเมินพื้นที่เพิ่มสูงสุดของ DDL/index/backfill/DELETE และ WAL จากการซ้อม local หากไม่มี headroom ที่ยืนยันได้ให้หยุด hosted mutation ไม่แก้ด้วยการเพิ่มพื้นที่หรืออัปเกรดแพ็กเกจ
- ข้อกำหนดนี้มีลำดับเหนือวิธีการที่เสนอไว้ในแผน ทุกขั้นต้องหลีกเลี่ยงการทำให้ Supabase Free เต็ม ไม่ถือว่า batch เล็กหรือ read-only รับประกันว่าไม่มีผลต่อทรัพยากร

คำว่า “เรียบร้อย” ต้องมีหลักฐานทั้ง schema, runtime, retention, สิทธิ์ และการกู้คืน ไม่ใช่เพียง deploy ผ่านหรือมี ID อ่านง่าย ไม่รับรองรองรับผู้ใช้หนึ่งล้านคนจากงานนี้

การขอวางแผนครั้งนี้ไม่ใช่การสั่ง apply migration, ลบข้อมูล, เปลี่ยน cron/flag หรือ deploy แผนนี้เอง เมื่อเริ่มลงมือให้ใช้ขอบเขตที่ผู้ใช้สั่งในเวลานั้นและตรวจสถานะซ้ำก่อนทุก hosted mutation

เอกสารที่เกี่ยวข้อง: [readiness](../../runbooks/database-readiness.md), [coordinate forecast](../../runbooks/coordinate-forecast.md), [identifier policy](../../runbooks/readable-identifiers.md), [inventory](../../database-table-review-2026-11-17.md)

## ฐานข้อมูลอ้างอิงและสิ่งที่ต้องรักษา

ผลอ่าน production `ClearPath_Final` (`kmvxwfrmmictzuxbsncr`) เวลา 15 พ.ย. ประมาณ 03:01 น. ไทย:

- ฐานข้อมูล 229.95 MB; WAL ที่นับจาก directory 134.22 MB; Storage metadata 44 objects รวม 13.94 MB ตัวเลขเหล่านี้ไม่ใช่พื้นที่ดิสก์ทั้งหมดหรือเปอร์เซ็นต์ quota
- public 63 ตาราง, private 4 ตาราง, Trust-private 10 ตาราง; public เปิด RLS ครบ ไม่พบ constraint/index invalid หรือ lock ค้าง
- 23 ID entity เดิมมี bigint และ code; identifier schema รุ่น 3, maintenance ปิด; ไม่มี legacy column ใน public
- snapshot CAMS 126,382 แถว ใช้ 126.53 MB รวม index; aliases รวม 65.19 MB และเกือบทั้งหมดอ้าง snapshot
- coordinate forecast อ่านกริดแล้ว แต่ station forecast ยังมี snapshot runtime; broad grid rollout ยังไม่เสร็จ
- cron 7 งานมี SQL execution สำเร็จใน 24 ชั่วโมง; recent-history cleanup สำเร็จล่าสุดและไม่พบ PM2.5 เกิน 72 ชั่วโมง การ dispatch สำเร็จยังไม่ยืนยัน HTTP worker หรือ upstream สำเร็จ
- readiness 503 `station_data_stale`, สด 0/182 สถานี ณ เวลาตรวจ; เวลาข้อมูลล่าสุด 02:00 น. ไทย ต้องตรวจว่าเป็นความล่าช้าชั่วคราวตามรอบต้นทางหรือระบบรับข้อมูลผิด
- weather_observations, fire_feature_snapshots, forecast_data_quality_daily ไม่มีแล้ว; satellite hotspot layer ต้องทำงานต่อ
- ไม่มี pending account erasure หรือ expired/non-held evidence ที่ค้าง purge ณ เวลาตรวจ

หลักฐาน catalog และ query plans อยู่ในโฟลเดอร์ส่วนตัวนอก Git: `~/Library/Application Support/ClearPath/Backups/readiness-20261114T200127Z/` เป็น metadata-only ไม่ใช่ backup ที่กู้คืนได้

## ลำดับงานและจุดผ่าน

| ระยะ | งาน                                          | สิ่งที่ปลดล็อก                             |
| ---- | -------------------------------------------- | ------------------------------------------ |
| 0    | เก็บ baseline และระบุผู้ใช้ตาราง/RPC ทั้งหมด | ทราบขอบเขตจริงก่อนแตะ production           |
| 1    | ตรวจ ingestion, ความสด, พื้นที่และผล worker  | ระบุปัญหาปัจจุบันและรู้ write headroom     |
| 2    | Backup ที่ครบและทดสอบ restore แบบแยก         | อนุญาตให้เปลี่ยน production โดยมีทางกู้คืน |
| 3    | เทียบ migration และเตรียม delta ที่ปลอดภัย   | ใช้เฉพาะ SQL ที่ production ยังขาด         |
| 4    | รวม forecast บนกริดชุดเดียว                  | หยุดสร้าง snapshot ซ้ำหลังพิสูจน์ reader   |
| 5    | เลิกใช้และถอด CAMS เก่าเป็นงานแยก            | ลดข้อมูล/index/alias ที่ไม่จำเป็น          |
| 6    | เก็บ ID, retention, สิทธิ์และ query ให้ครบ   | ฐานข้อมูลกับแอปตรงกันและดูแลต่อได้         |
| 7    | ตรวจ release, recovery และติดตามจริง         | ส่งมอบพร้อมหลักฐานและข้อจำกัด              |

งานอ่านโค้ด/เตรียม local ทำต่อได้ระหว่างรอ backup แต่ hosted rollout ต้องผ่าน gate ตามลำดับ ไม่ใช้การหมดเวลารอแทนหลักฐาน

## ระยะ 0 — baseline และบัญชีการใช้งาน

- [ ] อ่าน HEAD, production release, actual schema, migration history, functions/triggers, flag, cron และ scheduled workflows ใหม่ก่อนเริ่ม
- [ ] จัด inventory: ตาราง → feature → API/RPC → ผู้อ่าน/ผู้เขียน → sensitivity → retention → dependency → สถานะเก็บ/เลิกใช้
- [ ] ค้นทั้ง backend, frontend contract, cron, GitHub Actions, database triggers/functions/views และ scripts ก่อนสรุปว่าตารางไม่ใช้
- [ ] แยกตาราง audit/ledger/compatibility ออกจาก runtime ที่เลิกใช้ ตารางว่างหรือไม่มีชื่อใน frontend ไม่ใช่เหตุผลให้ DROP
- [ ] บันทึกขนาด relation/index, live/dead-row estimates, storage และ worker backlog โดยไม่เก็บข้อมูลผู้ใช้หรือ secrets ใน Git

ผ่านเมื่อรายการ dependency ครบและเทียบกับ catalog production ได้ หาก definition เปลี่ยนระหว่างงานให้หยุดขั้น mutation แล้วเทียบใหม่

## ระยะ 1 — ingestion และพื้นที่ Free

### Air4Thai และ freshness

- [ ] เทียบ source timestamp จาก upstream กับ latest stored reading, HTTP worker result, sync_runs, rejected_count และ reason โดยไม่เผยข้อมูลลับจาก log
- [ ] เทียบเวลาที่ใช้คำนวณ freshness, timezone และ cache; แยก cron dispatch, worker success และ upstream freshness ออกจากกัน
- [ ] ตรวจ primary 30 นาทีและ backup ที่ทำงานเมื่อ primary ขาดเท่านั้น ไม่เปิด collector ซ้ำหรือเพิ่ม retry ไม่จำกัด
- [ ] ถ้า upstream ไม่สด ให้แสดง delayed/unavailable ตามจริง ห้ามเปลี่ยน timestamp หรือขยายเกณฑ์ 1 ชั่วโมงเพื่อทำ readiness เขียว
- [ ] ถ้าพบ bug ให้แก้เฉพาะ parser/scheduling/persistence ที่ผิด พร้อม regression test ของกรณีนั้น

ผ่านเมื่อทราบสาเหตุและผล ingest ตรงกับ upstream ในสองรอบที่คาดว่าจะมีข้อมูลใหม่ ถ้า upstream ล่าช้าเอง ให้ส่งมอบพร้อมสถานะ degraded และเหตุผล ไม่รับรองว่าความสดถูกแก้แล้ว

### พื้นที่และ backpressure

- [ ] อ่าน disk/system/WAL usage จริงจาก monitoring ที่มีสิทธิ์ แล้วกำหนด quota และ utilization จาก denominator ที่ถูกต้อง
- [ ] จับขนาดเริ่มต้น/ปลายวันและอัตราเติบโตของ snapshot, aliases, readings, grids, cron logs และ Storage
- [ ] ยืนยัน cleanup throughput มากกว่าปริมาณแถวที่หมดอายุ ไม่ลด batch เดิม 1,000 เหลือ 500 ขณะที่ writer เก่ายังทำงาน
- [ ] เริ่มงานล้างที่ออกแบบใหม่ไม่เกิน 500 แถว/transaction หลังหยุด writer เก่าแล้ว ปรับตามระยะเวลา/WAL/lock ที่วัดจริง
- [ ] ที่ disk utilization 80% หยุดงานเขียนหนักที่ไม่จำเป็น; 90% หยุด optional collectors ก่อน โดยรักษา privacy/recovery workflow ไม่หยุด primary หรือระบบสำคัญแบบเหมา
- [ ] ถ้ายังมองไม่เห็น headroom ห้าม backfill/index build/cleanup ขนาดใหญ่บน production; เดินหน้า local และ read-only ได้

ห้าม VACUUM FULL, full-table rewrite หรือสร้างฐานข้อมูลใหม่เพื่อแก้พื้นที่ในงานนี้ การ DELETE ไม่ได้แปลว่าไฟล์ฐานข้อมูลจะเล็กลงทันที ต้องแยกพื้นที่คืนให้ PostgreSQL ใช้ซ้ำจากพื้นที่คืน filesystem

## ระยะ 2 — ดาวน์โหลด backup และทดสอบกู้คืนบน Mac เท่านั้น

- [ ] จัดเตรียม direct connection/tooling ที่อ่านได้ครบ หากใช้ API อย่างเดียวต้องระบุส่วนที่ export ไม่ได้ ห้ามเรียกว่า full backup
- [ ] บันทึก schema, rows, sequences, constraints, indexes, triggers, function definitions, grants/RLS, migration history, private/Trust data และ Auth ที่จำเป็น
- [ ] เก็บ Storage metadata และ object bytes จริงพร้อม checksum; เก็บ config/secret recovery แยกจากข้อมูลและแยกกุญแจเข้ารหัส
- [ ] Stream consistent logical export มาที่ Mac โดยไม่สร้างสำเนาบน server; คำว่า snapshot ในขั้นนี้หมายถึง transaction consistency ไม่ใช่ hosted snapshot หรือ replication slot กำหนด watermark และ reconcile objects ที่สร้าง/ลบระหว่าง export
- [ ] ใช้ brief coordinated write window เมื่อจำเป็นโดยมีระยะเวลาและทางยกเลิกชัดเจน ไม่ระงับ privacy deletion ไม่มีกำหนด
- [ ] เก็บนอก repo ด้วย private permissions และ encryption; manifest มี project, เวลา, schema version, hashes และรายการที่ไม่ครอบคลุม
- [ ] Restore ลง isolated database บน Mac เครื่องนี้เท่านั้น โดย cron, provider sends, push/LINE และ external collectors ปิดทั้งหมด ไม่สร้างหรือใช้ hosted project สำหรับสำเนาทดสอบ
- [ ] ตรวจ PK/FK/orphans, unique constraints, sequence next value, ID/code, row counts, Trust/XP ledger totals, รูปภาพและสิทธิ์
- [ ] ทดสอบ owner/other-user/Admin/service-role; ห้ามใช้ service-role เพื่อสรุปว่า RLS ผ่าน
- [ ] ทดสอบขั้นตอนนำ account closures/deletions ที่เกิดหลัง backup กลับมาใช้ก่อนเปิดระบบ และรักษา sent-event dedup เพื่อไม่ส่งข้อความซ้ำ
- [ ] จับ recovery time และจุดข้อมูลล่าสุดที่กู้ได้ เป้าหมายทดลอง backup อายุไม่เกิน 24 ชั่วโมง/กู้ไม่เกิน 4 ชั่วโมง ต้องระบุค่าที่วัดได้จริง

ผ่านเมื่อ restore สำเร็จจากข้อมูลปัจจุบันและมีผลตรวจ ไม่ใช้ schema fixture/PGlite rehearsal หรือ backup ID เก่าแทน

## ระยะ 3 — migration ที่ไม่ชนกับ production

- [ ] สร้างตาราง mapping ระหว่าง repository migrations, bootstrap ของโปรเจกต์ใหม่ และ hosted migration history
- [ ] ตรวจ production-only `20261110002811` จาก definition/history จริง ห้าม replay cron เก่าหรือ mark applied เพื่อให้รายการดูตรงอย่างเดียว
- [ ] เทียบ body/grants ของ `read_cams_grid_point`, `publish_cams_grid`, retention และ wrapper ที่เรียกจริง โดยบันทึก hash/semantic diff นอก Git ตามความอ่อนไหว
- [ ] แก้แผน rollout ให้ยอมรับว่า `20261114125539_coordinate_forecast_grid_reader` ติดตั้ง scalar reader แล้ว
- [ ] **ห้ามรัน `20261113192352_unified_cams_grid_reads.sql` ทั้งไฟล์บน production**: ไฟล์มี CREATE FUNCTION ของ reader ที่ติดตั้งแล้ว; สร้าง migration ใหม่เฉพาะ delta หลังเทียบปัจจุบัน
- [ ] ใช้ workflow migration ของโปรเจกต์และ CLI version ที่ตรวจแล้ว ไม่แก้ไฟล์ migration ที่เคย deploy เพียงเพื่อหลบ conflict
- [ ] ทดสอบ delta บน restored schema รวมกรณี rollback และ function privilege; DDL ใช้ lock timeout 5s และ statement timeout 30s
- [ ] บันทึก apply และ migration history อย่างสอดคล้องใน transaction เมื่อเครื่องมือรองรับ ไม่ blanket db push

ผ่านเมื่อ delta ไม่สร้าง reader ซ้ำ ไม่ย้อนแก้ coordinate forecast และไม่แตะ policy/cron/trial cutoff นอกขอบเขต

## ระยะ 4 — CAMS ชุดเดียวสำหรับทุกหน้าจอ

### เป้าหมายข้อมูล

ใช้ cams_grid_definitions / generations / frames / active เป็นข้อมูลพยากรณ์หลัก; jobs / chunks เป็นงานเก็บชั่วคราว การเลือกสถานีแปลงเป็นพิกัดแล้วอ่าน cell จาก generation เดียวกับแผนที่ ไม่ต้องเก็บ forecast ซ้ำต่อสถานี

- [ ] ไล่ consumer ทั้ง station/coordinate forecast, graph/map, validation, provider health, export และ operational tooling
- [ ] ใช้ service-only scalar RPC; frontend ไม่ดาวน์โหลดกริดทั้งประเทศทุกคำขอและไม่เรียก provider ต่อผู้ใช้
- [ ] ตรวจ nearest native cell, tie-breaking, bounds, index และ null cells; ห้ามเอาสถานีวัดจริงมาใช้แทนข้อมูลโมเดลหรือเติมช่องว่างเป็นศูนย์
- [ ] เทียบ map/graph สำหรับ generation/cell/time เดียวกัน ไม่ใช้ “snapshot เดิมต้องเท่ากริด” เป็นเกณฑ์ เพราะต่าง provider issuance/ตำแหน่งได้
- [ ] รักษา freshness: ปกติถึง 18 ชั่วโมง, stale หลัง 18 ชั่วโมง, unavailable ตั้งแต่ 36 ชั่วโมง; ไม่ทำ timestamp ใหม่เมื่อ payload เดิม
- [ ] ทดสอบ partial horizon, missing generation 410/retry ครั้งเดียว, cache expiry/offline, generation rollover และ failure ที่ไม่ทับ active generation
- [ ] ใช้ local/isolated canary ครบก่อนเปิด station flag; เปิด production ด้วย release/config ที่บันทึกและย้อนกลับได้
- [ ] อ่านผลสอง grid collection รอบหกชั่วโมงที่สำเร็จภายใน worker window ที่อนุญาต ไม่ต่ออายุ trial/เพิ่ม paid workers เพื่อผ่านการทดสอบ
- [ ] ยืนยัน producer, scheduler, manual scripts และ cron route เก่าถูกหยุดครบ และไม่เกิด snapshot ใหม่หลัง cutoff
- [ ] คงตารางเก่าและ rollback code ชั่วคราวตามช่วงสังเกตที่กำหนด; ไม่ปล่อย dual-write ไม่มีกำหนด

ผ่านเมื่อทุก consumer ที่ต้องใช้ forecast ไปกริดแล้ว ข้อมูลตรงตาม sampling contract, collection สองรอบผ่าน และไม่มี writer เก่าหลงเหลือ

## ระยะ 5 — ถอด snapshot เดิมอย่างเจาะจง

ตารางเป้าหมาย: `forecast_provider_snapshots`, `forecast_provider_sync_runs` เท่านั้น หลังระยะ 2–4 ผ่าน ไม่รวมข้อมูลสถานีตรวจวัดจริงหรือ satellite hotspot

- [ ] ทำ final targeted backup ของสองตาราง, aliases, sequences และ dependencies ที่จำเป็นต่อการ restore แล้วทดสอบอ่านกลับ
- [ ] ปิด legacy read/write paths ก่อนถอดตาราง; ยืนยันไม่มี traffic/worker เรียก path เหล่านี้ตลอดช่วงสังเกตอย่างน้อย 24 ชั่วโมง
- [ ] แยก destructive migration ออกจาก additive rollout และจาก deployment ปกติ จัดทำรายการ object ที่จะหายให้ตรวจได้
- [ ] ถอดเฉพาะ dependent views/RPC/registry entries ที่พิสูจน์ว่าใช้ตารางเก่า; DROP แบบไม่ CASCADE เพื่อให้ dependency ที่หลงเหลือทำให้หยุด
- [ ] เก็บ current coordinate RPC และ pipeline กริดไว้; ตรวจ REQUIRED_TABLES, health checks และ identifier registry ไม่ให้ค้างชื่อเก่า
- [ ] ล้าง aliases เฉพาะ entity ของตารางที่เลิกแล้วด้วย batch/cursor/resume; ไม่ล้าง aliases ของผู้ใช้ รายงาน หรือลิงก์เก่าโดยรวม
- [ ] วัด relation size/WAL/latency ก่อน–หลัง และปล่อย autovacuum ทำงาน ไม่ rebuild ฐานข้อมูล

ประมาณ 191.7 MB เป็นขนาดรวม snapshot relation กับ aliases ทั้งตาราง ณ baseline ไม่ใช่คำรับรองว่าจะคืน filesystem ได้เท่านี้หรือทันที

Rollback ก่อน DROP: คืน flag และ writer ตาม config ที่บันทึก โดยตรวจ snapshot freshness ก่อน หาก snapshot ไม่สด ให้ unavailable ตามจริงหรือใช้ targeted restore ห้ามเปิด writer อัตโนมัติซ้ำกับกริดโดยไม่ตรวจ

Rollback หลัง DROP: คืนเฉพาะ object/ข้อมูล CAMS ที่จำเป็นจาก targeted backup ไม่ restore ฐานข้อมูลทั้งหมดทับข้อมูลผู้ใช้ใหม่

## ระยะ 6 — ID และวงจรชีวิตข้อมูลทั้งหมด

### ID อ่านง่าย

- [ ] ยืนยัน 23 entity เดิมมี PK/FK bigint, generated code, unique constraint, correct sequence และ API contract ครบจากฐานข้อมูลจริง
- [ ] ทำรายการ 6 ตาราง UUID ใหม่และ consumer ของแต่ละ ID ก่อนตัดสินใจ
- [ ] ค่าเริ่มต้นสำหรับ compatibility: เพิ่ม readable display code เฉพาะ entity ที่ผู้ใช้/Admin/กรรมการต้องอ้าง ไม่ rewrite PK/FK ที่ใช้งานแล้วโดยไม่มีประโยชน์ชัดเจน
- [ ] account_privacy_requests ใช้รหัสคำขอสำหรับเจ้าของ/ผู้ตรวจที่มีสิทธิ์; UUID ภายในยังใช้ได้และไม่ทำให้ request เข้าถึงได้ข้ามบัญชี
- [ ] community_coverage_missions, community_device_evaluations, community_evidence_outcomes ใช้ code หากมีหน้าจอ/เอกสารอ้างอิง; เลือก prefix หลังตรวจ registry ไม่ให้ชน
- [ ] measurement_notification_batches ใช้ code ภายในสำหรับติดตามงานเมื่อจำเป็น; batch items อ้าง batch code กับลำดับ/คีย์ที่มีอยู่ ไม่เพิ่ม surrogate ID ให้ทุก join table โดยไม่จำเป็น
- [ ] แยก Auth UID, request idempotency key, lease/fencing token และ secret ออกจาก display code ห้ามเปลี่ยนเป็นเลขเดาง่ายเพื่อความสวยงาม
- [ ] เก็บ private legacy aliases ที่จำเป็นต่อ Auth/retry/ลิงก์เดิม; prune ได้เฉพาะ telemetry entity ที่ retire แล้วและผ่าน retention
- [ ] ถ้าจำเป็นต้อง backfill code ให้ทำแบบเพิ่ม schema ก่อน, batch เล็ก, resume ได้ และตรวจ query/WAL budget ก่อน
- [ ] ตรวจ browser/TypeScript ไม่แปลง bigint ID เป็น JavaScript Number; display code ไม่ใช่สิทธิ์เข้าถึงข้อมูล

### Retention matrix

| กลุ่ม                        | วิธีจัดการ                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM2.5 / sync / rate windows  | รักษา policy ปัจจุบัน 72 ชั่วโมงและ bounded cleanup; แยก config writer 7 วันจาก retention ที่มีผลจริงให้สอดคล้องหลัง cutover                                                     |
| CAMS grid                    | ตั้งเป้า retention 72 ชั่วโมงพร้อม active/latest-two-ready protection, ข้าม leased jobs, ลบ generation หมดอายุไม่เกินหนึ่งต่อรอบ; ตรวจว่าไม่ตัด generation ที่ client ยังใช้อยู่ |
| CAMS jobs/chunks             | ล้างเฉพาะ terminal/expired และรักษา lease, retry, publication transaction                                                                                                        |
| รายงาน/ความคิดเห็น/ปฏิกิริยา | ไม่ใช้ TTL 3 วันแบบข้อมูลอากาศ; รักษาประวัติและ user deletion policy                                                                                                             |
| Evidence/GPS/ภาพ             | private bucket, short signed URL, expiry/audit hold; ลบ object สำเร็จก่อน marker เสร็จและ retry ได้                                                                              |
| Trust / XP / reputation      | รักษา ledger/idempotency/คะแนนเดิม; Trust ใช้ policy retention ที่อนุมัติ ไม่ล้างคะแนนเพราะ feature เปลี่ยน                                                                      |
| Measurement / notifications  | รักษา unfinished work, claim/lease/retry และ dedup window; terminal cleanup ตาม policy เท่านั้น                                                                                  |
| LINE / locations / inbox     | รักษา consent, quiet hours, budget, trial cutoff, location 24h และ terminal inbox 30d ตาม policy ปัจจุบัน                                                                        |
| Audit / closure / aliases    | policy เฉพาะประเภท, privacy erasure ต้องเดินต่อ; ห้ามตั้ง TTL ใหม่เองเมื่อยังไม่มี policy                                                                                        |
| News / satellite hotspots    | รักษา source freshness และ attribution; ไม่ดึงข้อมูลเก่ากลับมาหลัง restore                                                                                                       |

- [ ] ทุกประเภทมี owner, cutoff column, batch cap, lease/hold protection, last success และ alert เมื่อ cleanup ตามไม่ทัน
- [ ] ตรวจ Storage orphan แบบ candidate list และ dry run; รักษาภาพของ report/evidence/draft และ active upload ห้ามลบตามเวลาเพียงอย่างเดียว
- [ ] ตรวจ cron.job_run_details/log retention ที่รองรับ แยก log metadata จาก business ledger; ไม่พิมพ์ cron commands/secrets ลงรายงาน

### สิทธิ์และ query

- [ ] ทดสอบ anonymous / owner / other user / Admin / worker ทั้ง DB และ API รวม exact GPS, evidence, signed image URL, report/comment ownership, closure และ queue RPC
- [ ] public tables เปิด RLS ครบ; ตรวจ views security_invoker, SECURITY DEFINER execution grants/search_path และ private schema grants หลัง migration
- [ ] Admin/Moderator dashboard คง read-only; backend service-role ต้องตรวจ ownership/visibility เองทุก path
- [ ] ตรวจ keyset pagination, stable ordering, lookahead/cursor validation, upper bound และ response cap ของ map history, audit, notifications, reports และ search
- [ ] ตรวจค้นพื้นที่/เวลา/status ด้วย workload ที่แทนผู้ใช้จริง วัด p50/p95/error และ EXPLAIN ก่อนเพิ่ม index
- [ ] Audit table เล็กใช้ sequential scan ไม่ใช่ bug โดยตัวมันเอง; ทุก index ที่เพิ่มต้องมี query และขนาด write/storage cost รองรับ
- [ ] งาน broadcast ที่ยัง materialize ผู้ใช้ทั้งชุดให้มี durable queue/checkpoint เมื่อ workload เรียกร้อง; cache/queue ไม่เปลี่ยนสิทธิ์หรือทำให้ข้อมูลล้าสมัยเกิน policy

## ระยะ 7 — การทดสอบ ส่งมอบ และการปิดงาน

### Local / isolated

- [ ] ใช้ restored dataset ที่ปิดการส่งภายนอกและแยกจาก production; localhost ที่ชี้ DB จริงไม่ถือว่า isolated
- [ ] รัน Python/frontend tests ที่เกี่ยวข้อง และ isolated SQL suites สำหรับ unified CAMS, identifiers, account erasure, Trust, contribution-v3, LINE, retention
- [ ] ทดสอบ upgrade จาก actual restored schema, failed migration rollback, missing generation, concurrent claims, duplicate retries และ cleanup resume
- [ ] รัน lint/format/typecheck/build ตาม AGENTS.md; ไม่ใช้การ build ผ่านเป็นหลักฐานว่า migration ถูก apply
- [ ] Load test แบบค่อยเพิ่ม 10/25/50 concurrent readers รอบละ 10 นาที พร้อมข้อมูล forecast ไม่ว่าง, map-history และ notifications; แยก write contention/queue tests
- [ ] เป้าหมายทดลอง p95 <=2s, errors <1%, backlog ไม่เพิ่ม; วัด CPU/RAM/IO/connections/WAL ประกอบ ตัวเลขนี้ไม่ใช่ capacity guarantee สำหรับล้านบัญชี

### Production แบบเบา

- [ ] อ่าน health/readiness/release และตรวจ migration/function definitions ที่คาดหวังหลังแต่ละขั้น
- [ ] Smoke test ด้วยบัญชีทดสอบที่จำกัด และ query/read budget; ไม่ load test บน Free production
- [ ] สังเกตอย่างน้อย 24 ชั่วโมง, สอง grid collection รอบ และอย่างน้อยหนึ่งรอบตามกำหนดของทุก job ที่เกี่ยวข้อง โดยไม่ต่ออายุ trial
- [ ] หยุด rollout เมื่อ p95 แย่กว่า baseline >20% ต่อเนื่อง 5 นาที, timeouts ซ้ำ, backlog โต, disk ถึงเกณฑ์หยุด, ledger/FK ไม่ตรง หรือ privacy leak

### สิ่งส่งมอบ

- [ ] ERD/data dictionary/inventory ล่าสุด พร้อม purpose, PK/FK, code, ownership, retention และสถานะ runtime/audit ของทุกตาราง
- [ ] migration reconciliation, apply/rollback notes และ checksums ที่ไม่มี secrets
- [ ] backup manifest + restore results + RTO/RPO ที่วัดจริง เก็บส่วนอ่อนไหวนอก Git
- [ ] ตารางก่อน–หลังของ relation/storage/WAL, เวลา query, queue backlog และ cleanup timestamps
- [ ] รายการงานเสร็จ/ยกเว้น/ค้าง พร้อมเหตุผล ผู้รับผิดชอบ และ trigger ที่ต้องกลับมาทำต่อ

ปิดงานได้เมื่อ CAMS ไม่มี runtime/writer ซ้ำ, ไม่เหลือตารางที่พิสูจน์ว่า retire แล้ว, ID ที่ต้องแสดงอ่านง่าย, retention/สิทธิ์/recovery ผ่าน และสถานะ production ถูกอธิบายตามจริง หาก upstream stale, monitoring ขาด หรือ restore ยังไม่ผ่าน ต้องระบุว่างานนั้นยังไม่ปิด
