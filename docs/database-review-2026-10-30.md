# ClearPath database review — 2026-10-30

รายงานนี้เป็น snapshot ก่อนถอดตารางเก่า ดูสถานะหลังดำเนินการที่
[บันทึกการถอด 12 ตาราง](runbooks/legacy-table-retirement-2026-10-30.md)

รีวิวรายตารางจาก `supabase/schema.sql`, migrations และ backend ที่อ่านเขียนข้อมูล ไม่ใช่ผล audit ฐานข้อมูล production ที่เชื่อมต่ออยู่

สร้าง schema จำลองด้วย PGlite ได้ **48 ตารางใน public** รวม validation สำหรับ staging 3 ตาราง ทุกตารางเปิด RLS ใน schema ที่จำลอง การเปิด RLS ไม่ได้ยืนยันว่าฟังก์ชัน privileged ปลอดภัย หรือสิทธิ์ production ตรงกับไฟล์

ไม่รวมตารางภายในของ Supabase เช่น `auth.*`, `storage.*`, `cron.*`, `vault.*` ในจำนวนนี้ ไม่รัน scheduler หรือเข้าถึง secrets; migrations ของ cron 3 ไฟล์ตรวจจาก source เท่านั้น ส่วน validation รัน evidence ก่อน diagnostics ตาม dependency ที่ระบุในไฟล์

ระดับผลตรวจ:

- **P1**: ควรแก้ก่อนใช้งานวงกว้าง — สิทธิ์หรือการเก็บข้อมูลส่วนตัวผิดเงื่อนไข
- **P2**: ข้อบกพร่องด้านความถูกต้อง การ retry หรือ concurrency ที่มีเงื่อนไขกระตุ้นชัดเจน
- **ปรับปรุง**: ข้อเสนอที่ต้องดู workload/EXPLAIN/นโยบายเก็บข้อมูลก่อน ไม่ถือว่าเกิด incident แล้ว
- **ไม่พบจุดเสียชัดเจน**: ไม่พบ defect เพิ่มในขอบเขต source review ไม่ใช่การรับรอง production

## ข้อบกพร่องที่ควรแก้ก่อน

### F1 — P1: public RPC เขียน community_reports ข้าม API

`supabase/migrations/20260917_report_engagement.sql:41` สร้าง `refresh_report_engagement_counts(uuid)` เป็น `SECURITY DEFINER` แต่ไม่มี REVOKE EXECUTE จาก PUBLIC/anon/authenticated และไม่มี authorization ภายใน

ทดสอบใน PGlite: `has_function_privilege` เป็น true ทั้ง anon และ authenticated; `SET ROLE anon` แล้วเรียกฟังก์ชันได้จริง ฟังก์ชันคำนวณ counts ใหม่และเปลี่ยน updated_at ของ report ที่ระบุ แม้ caller ไม่มีสิทธิ์เขียนตารางโดยตรง ไม่ได้เปิดให้อ่านพิกัดหรือกำหนด PM2.5 อิสระ แต่เป็น write path ที่ข้าม boundary ที่โปรเจกต์กำหนด

แนวแก้: migration ใหม่ถอนสิทธิ์เรียกโดยตรงจาก browser roles และให้เฉพาะ service_role ตามความจำเป็น ตรวจสิทธิ์ trigger helper ด้วย; การเห็น EXECUTE ของฟังก์ชัน RETURNS TRIGGER ไม่ได้แปลว่าเรียกเป็น RPC ปกติได้เหมือน RETURNS VOID

### F2 — P1: purge สองตารางไม่ atomic ทำให้พิกัดจริงค้างถาวร

`backend/services/supabase_client.py:1944` อัปเดต `report_evidence.purged_at` ก่อนอ่านและล้าง `community_reports` หากคำสั่งหลังล้มเหลว cron รอบถัดไปไม่เลือกแถวนี้แล้ว เพราะ `list_expired_report_evidence` เลือกเฉพาะ `purged_at IS NULL`

จำลอง failure หลังเขียน evidence สำเร็จแล้วพบ marker ว่าล้างเสร็จ ทั้งที่คำสั่งล้าง community report ยังไม่สำเร็จ

แนวแก้: ใช้ transaction/RPC ล้าง metadata สองตารางร่วมกัน และตั้ง completion marker เมื่อทั้งคู่สำเร็จ การลบ Storage อยู่นอก transaction จึงต้องคงการ retry ที่ลบซ้ำได้ ตรวจ audit_hold อีกครั้งในขั้นตอนที่เหมาะสม

### F3 — P2: notification dedup เปลี่ยน primary key จนติด FK

`backend/services/notifications.py:98` สร้าง UUID ใหม่ทุกครั้ง ส่วน `backend/services/supabase_client.py:1142` upsert โดย conflict `(user_id,deduplication_key)` ทำให้ replay พยายามเปลี่ยน id ของ notification เดิม เมื่อ `notification_outbox.notification_id` อ้างถึงแถวนั้นจะเกิด FK violation (23503)

ทดสอบ SQL จำลองรูปแบบ upsert นี้ใน PGlite ได้ error 23503 จริง หากยังไม่มี outbox อ้างถึง การ replay ยังมีโอกาสรีเซ็ต read_at และ created_at ของรายการเดิม

แนวแก้: insert-on-conflict-do-nothing แล้วคืนแถวเดิม หรือใช้ ID ที่คงที่ พร้อมรักษา read_at/created_at เดิม และบันทึก inbox/outbox เป็น transaction เดียว

### F4 — P2: outbox ทั่วไปไม่มี atomic claim และ enqueue reset งานเดิมได้

`backend/services/supabase_client.py:1198` upsert event_key เดิมด้วยข้อมูลที่มี status=pending และ attempts=0 จึงสามารถรีเซ็ตงานที่ sent แล้ว หาก execution มาถึงจุดนี้ซ้ำ (เช่น เมื่อไม่มี FK ของ F3 มาขวาง)

`backend/services/notifications.py:147` อ่าน pending/failed แล้วส่งโดยไม่มี claim สำหรับงานทั่วไป มี lease เฉพาะ payload ที่มี measurement_request_id เท่านั้น workers สองตัวจึงอ่านและส่งงานทั่วไปชิ้นเดียวพร้อมกันได้

แนวแก้: conflict ไม่เขียนทับ sent jobs; ใช้ claim/lease ที่ atomic สำหรับทุกประเภทงาน พร้อม recovery เมื่อ worker หยุด การอัปเดต DB หลัง provider ส่งสำเร็จยังต้องออกแบบ provider idempotency ให้รองรับ retry

### F5 — P2: bootstrap ทำ LINE FK หายและชนิด user_id ไม่ตรง production schema

`supabase/schema.sql:189` สร้าง LINE links ด้วย user_id TEXT ต่อมา foundation DROP profiles CASCADE ลบ FK แต่ไม่ลบ LINE table แล้ว `20260807_line_notifications.sql` ใช้ CREATE TABLE IF NOT EXISTS จึงไม่แปลงเป็น UUID และไม่คืน FK

ทดสอบลำดับนี้แล้ว column ยังเป็น TEXT, FK count=0 และลบ auth user แล้ว LINE link ยังอยู่

แนวแก้: migration ใหม่ตรวจข้อมูล orphan/UUID ที่ไม่ถูกต้องก่อนแปลงชนิดและเพิ่ม FK ไม่แก้ migration ที่ apply แล้ว และไม่ลบข้อมูลเชื่อม LINE โดยไม่มีการจัดการข้อมูลเดิม

### F6 — P2: ดาวและ Trust อาจค้างเมื่อมีคำขอพร้อมกัน

`backend/services/community/reviews.py:55–99` แยก read-existing, upsert review, read-all-reviews และ update aggregate เป็นคนละคำสั่ง ไม่มี lock บน report ครอบทั้ง workflow

สอง reviewer พร้อมกันทำให้ request A อ่าน snapshot เก่าก่อน B บันทึก จากนั้น B เขียน aggregate ใหม่ แล้ว A เขียนทับด้วย aggregate เก่าได้ ทั้งที่ review จริงอยู่ครบ นอกจากนี้ผู้ใช้คนเดียวส่งพร้อมกันผ่าน check ก่อน upsert ทั้งคู่ได้ จึงไม่รับประกันกติกาให้ดาวได้ครั้งเดียว

แนวแก้: serialize ต่อ report ใน transaction/RPC; insert review แบบไม่แก้แถวเดิมเมื่อซ้ำ แล้วคำนวณ aggregate/Trust ตามชุดข้อมูลเดียวกัน ตรวจด้วย concurrent sessions จริงก่อนถือว่าแก้ครบ ประเด็นนี้ยืนยันจากลำดับคำสั่งใน source ยังไม่ได้จำลอง concurrent PostgreSQL sessions

## รีวิวครบทุกตาราง

### ข้อมูลตรวจวัดและการนำเข้า — 6 ตาราง

| ตาราง                    | หน้าที่และโครงสร้างที่ตรวจ                                                                          | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stations`               | PK id จาก Air4Thai; ค่า headline และ recorded_at; RLS และถอน browser grants                         | **ปรับปรุง:** upsert เขียน headline ทับโดยไม่เปรียบเทียบ recorded_at ที่ DB หาก sync ซ้อนกันและตอบกลับสลับลำดับ ค่าเก่าทับใหม่ได้ ควรมี conditional upsert; เพิ่ม CHECK lat/lon และค่าฝุ่นเมื่อกำหนดกติกาข้อมูล invalid แล้ว |
| `pm25_readings`          | PK bigint; UNIQUE(station_id,recorded_at); FK stations cascade; source_at/ingested_at/source_status | กัน timestamp ซ้ำได้; **ปรับปรุง:** station_id ยัง nullable และ observed row ยังไม่บังคับมี PM2.5 ที่ใช้ได้; index station/time สองชุดมี prefix ซ้ำกัน ควรดู query plan ก่อนลด index; อย่าลบประวัติเป็นการ cleanup ทั่วไป    |
| `sync_runs`              | PK UUID; source/status/counters; index(source,started_at DESC)                                      | **ไม่พบจุดเสียชัดเจน:** เหมาะกับติดตามรอบ sync; เพิ่มนโยบายจัดการ running ที่ค้าง และอายุ log โดยรักษาหลักฐาน freshness                                                                                                      |
| `weather_observations`   | PK(station_id,recorded_at); FK stations; source/ingestion timestamps                                | **ไม่พบจุดเสียชัดเจน:** key รองรับ latest/history ต่อสถานี; CHECK ช่วง humidity/rain/wind เป็น hardening ที่ควรกำหนดตาม provider ไม่ใส่ตามการคาดเดา                                                                          |
| `weather_forecasts`      | PK(station_id,issued_at,forecast_at); FK stations                                                   | **ปรับปรุง:** ระบุ issued/valid time ชัดแล้ว; source_status default observed อาจทำให้ตีความ forecast เป็น observation ควรแยก semantic ใน data dictionary; ยังต้องกำหนด retention ของ forecast อากาศ                          |
| `fire_feature_snapshots` | PK(station_id,recorded_at); FK stations; counts/FRP และ source status                               | **ปรับปรุง:** เพิ่ม CHECK counters/FRP ไม่ติดลบเมื่อยืนยัน domain; เป็น hotspot features ไม่ใช่เหตุไฟไหม้ยืนยัน และไม่ใช่จุด hotspot ดิบสำหรับตรวจ freshness รายเหตุการณ์                                                    |

### บัญชี รายงาน และหลักฐาน — 10 ตาราง

| ตาราง                | หน้าที่และโครงสร้างที่ตรวจ                                                                                         | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`           | PK/FK auth.users cascade; role CHECK; counters ไม่ติดลบ; SELECT policy เฉพาะเจ้าของ                                | **ปรับปรุง:** boundary role ถูกแยกจาก user_metadata แล้ว; role update กับ audit ใช้แยกคำสั่งและ rollback แบบ best effort ควรรวม transaction ถ้าต้องรับประกัน audit; ทดสอบ ensure_profile พร้อมกันซึ่งใช้ select-then-insert            |
| `capture_sessions`   | PK UUID; FK profile cascade; expires_at>issued_at; atomic consume RPC จำกัด service_role                           | **ไม่พบจุดเสียชัดเจน** ในการ consume ครั้งเดียว; **ปรับปรุง:** ไม่มี cleanup ที่พบสำหรับ session หมดอายุ ต้องระวัง FK จาก reports/drafts ก่อนกำหนดการลบ                                                                                |
| `report_drafts`      | PK UUID; UNIQUE capture_session; FK profile/session; พิกัดจริงและรูป private; expires_at CHECK; owner/expiry index | **ปรับปรุง:** cleanup เรียง expires_at แต่ index ที่มีนำด้วย user_id ควร EXPLAIN; discard ลบ DB row ก่อนลบ Storage ถ้า Storage ล้มจะไม่มี draft ให้ retry ควรมี cleanup work record ที่คงอยู่                                          |
| `community_reports`  | PK UUID; UNIQUE capture_session/image_sha256; FK profile; status/PM2.5 constraints; public coords แยก raw coords   | **P1 F1/F2, P2 F6:** privileged write เปิด, purge ไม่ atomic, aggregates แข่งกันได้; legacy moderation RPC ยังมี checklist เดิม backend ต้องส่ง compatibility flags ควรเปลี่ยน RPC ให้สะท้อน OCR-number-only โดยตรงผ่าน migration ใหม่ |
| `report_evidence`    | PK/FK report cascade; private GPS/EXIF/OCR/original image; unique session; partial retention index                 | **P1 F2:** completion marker ตั้งก่อนการล้าง report สำเร็จ; private RLS ดีใน schema แต่ต้องตรวจ bucket/grants จริงและ signed URL บน production เพิ่ม                                                                                   |
| `report_reviews`     | PK bigint; UNIQUE(report,reviewer); FK report/profile; rating 1–5 CHECK และ reason code                            | **P2 F6:** upsert ไม่บังคับให้ดาวครั้งเดียวเมื่อส่งพร้อมกัน และ aggregate ไม่ atomic; rating ยัง nullable ใน schema เพราะ legacy migration ควร backfill/NOT NULL เมื่อยืนยันข้อมูลเก่า                                                 |
| `report_reactions`   | PK(report,user); reaction CHECK; FK ทั้งสอง; trigger อัปเดต counts                                                 | **เกี่ยวข้องกับ P1 F1:** helper ที่ trigger ใช้เปิด RPC สาธารณะ; **ปรับปรุง:** ทดสอบ concurrent insert ต่างผู้ใช้กับการ refresh counts ก่อนสรุปว่า count ถูกต้องเสมอ                                                                   |
| `report_comments`    | PK UUID; body trimmed 1–500; status CHECK; FK report/profile; partial index published/report/time                  | **เกี่ยวข้องกับ P1 F1:** ใช้ helper เดียวกับ reactions; **ไม่พบจุดเสียชัดเจน** เพิ่มใน constraints ของ body/status                                                                                                                     |
| `reputation_events`  | PK bigint; unique idempotency_key; FK profile cascade/report set null; atomic event/profile update RPC             | จุดดีคือ event และ counters อัปเดตใน transaction; **ปรับปรุง:** weekly leaderboard/points อ่านรายการผ่าน REST โดยไม่มี pagination อาจรวมคะแนนไม่ครบเมื่อชน row cap ควร aggregate ใน SQL หรือ paginate                                  |
| `rate_limit_windows` | PK(actor_key,action,window_started_at); atomic upsert counter ใน RPC                                               | **ไม่พบจุดเสียชัดเจน** ใน atomic increment; **ปรับปรุง:** ไม่มี cleanup ของ buckets เก่าที่พบและไม่มี index นำด้วยเวลา ควรวาง retention โดยไม่ลบ bucket ที่ยังใช้งาน                                                                   |

### การแจ้งเตือน เนื้อหา และ audit — 12 ตาราง

| ตาราง                      | หน้าที่และโครงสร้างที่ตรวจ                                                                          | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification_preferences` | PK/FK profile cascade; flags/consent/timezone/quiet hours CHECK                                     | **ไม่พบจุดเสียชัดเจน:** default consent=false สำหรับ row ใหม่; **ปรับปรุง:** list ทั้งหมดไม่ paginate อาจทำให้ fanout ตกหล่นเมื่อเกิน REST cap; ตรวจช่วงพิกัดและ threshold ตาม product rules                           |
| `user_notifications`       | PK UUID; UNIQUE(user,dedupe); FK profile; own-read RLS; partial unread index                        | **P2 F3:** replay เปลี่ยน PK จนติด FK หรือรีเซ็ต read state; list รวมอ่านแล้วเรียง created_at อาจต้อง index(user_id,created_at DESC) เพิ่มหลัง EXPLAIN                                                                 |
| `notification_outbox`      | PK UUID; UNIQUE event_key; FK profile/notification; status/attempt constraints; partial queue index | **P2 F3/F4:** enqueue/reset และ concurrent delivery; สร้าง inbox/outbox ทั่วไปไม่ atomic; summary อ่านเพียง 1,000 แถวล่าสุดจึงเป็น sampled status ไม่ใช่จำนวนทั้ง queue                                                |
| `line_notification_links`  | ตั้งใจเป็น PK/FK profile; unique LINE ID และ link hash; private RLS                                 | **P2 F5:** bootstrap path ทำ user_id เป็น TEXT และ FK หาย; ต้อง forward migration หลังตรวจ orphan                                                                                                                      |
| `line_webhook_events`      | PK event_id; expiry index; service-role-only claim RPC                                              | **ไม่พบจุดเสียชัดเจน:** claim ใช้ INSERT ON CONFLICT DO NOTHING; cleanup ลบเก่าตอนรับ webhook อาจแบ่ง batch หากโตมาก                                                                                                   |
| `push_subscriptions`       | PK UUID; UNIQUE endpoint; FK profile; private RLS                                                   | **ปรับปรุง:** delivery ปัจจุบัน retire web_push แต่ตารางยังอยู่ ต้องตกลง retention/decommission ก่อนลบ endpoint/key; ตารางว่างไม่ใช่หลักฐานว่าเลิกใช้ครบ                                                               |
| `alert_events`             | PK UUID; unique dedupe; payload/recipient_count/sent_at; private RLS                                | **ปรับปรุง:** create ใช้ select-then-insert จึงเกิด unique violation เมื่อ cron ซ้อนกัน; fanout ไม่ atomic ถ้าล้มกลางทาง event มีอยู่แล้ว รอบ retry อาจข้ามผู้รับที่เหลือ ควรมี fanout completion/cursor ที่ retry ได้ |
| `public_map_events`        | PK UUID; event type CHECK; entity UUID; time index; public SELECT policy/realtime publication       | **ไม่พบจุดเสียชัดเจน:** payload มีเพียง invalidation ไม่มีพิกัดจริง; ไม่มี FK เป็นรูปแบบ event ที่อาจอยู่หลัง report ถูกลบได้ ควรกำหนด retention และไม่เติมข้อมูลส่วนตัวใน payload                                     |
| `announcements`            | PK UUID; kind/severity/status CHECK; FK created_by/updated_by set null; publish/expiry fields       | **ปรับปรุง:** published boolean กับ status เป็น state สองชุด ควรป้องกันการขัดกัน; public image bucket ตั้งใจแยกจากรูป report; index query เผยแพร่ต้องดู workload ก่อน                                                  |
| `activities`               | PK UUID; reward>=0; target_count>0 ถ้ามี                                                            | **ไม่พบจุดเสียชัดเจน:** RLS/server-only; เพิ่ม CHECK ends_at>starts_at เมื่อทั้งคู่มีค่าได้ตาม product semantics                                                                                                       |
| `audit_logs`               | PK bigint; FK actor set null; action/entity/details/timestamp; RLS                                  | **ปรับปรุง:** มีเพียง PK index ขณะที่ list/filter ตามเวลา/action/entity ควร EXPLAIN; audit role changes ยังไม่ atomic; ไม่ purge log เพียงเพราะตารางใหญ่โดยไม่มี retention policy                                      |
| `data_issue_reports`       | PK UUID; FK user cascade; category/status/message length checks; status/time index                  | **ไม่พบจุดเสียชัดเจน:** private queue และ query ด้านสถานะมี index; กำหนด retention ของข้อความผู้ใช้และนโยบายเมื่อผู้ใช้ลบบัญชี                                                                                         |

### คำขอวัดค่าฝุ่น — 4 ตาราง

| ตาราง                            | หน้าที่และโครงสร้างที่ตรวจ                                                                               | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `measurement_helper_presence`    | PK/FK user; location/accuracy checks; enabled/location coherence; partial location index; atomic set RPC | **ไม่พบจุดเสียชัดเจน** ใน opt-out ที่ล้าง GPS; **ปรับปรุง:** พิกัดล่าสุดไม่ถูกล้างอัตโนมัติตามอายุ และ matching ใช้ตำแหน่งล่าสุดโดยไม่มี max-age ซึ่ง UI ระบุไว้แล้ว ควรกำหนด retention เป็นนโยบายให้ชัด                                   |
| `measurement_requests`           | PK UUID; UNIQUE(user,idempotency); status/radius/window checks; FK owner/result; work/terminal indexes   | **ไม่พบจุดเสียชัดเจน:** quota/dedup ใช้ per-user advisory lock และ finish ใช้ conditional status update; ควร EXPLAIN work_rows ที่รวม active+terminal และเพิ่ม consistency ของ fulfilled/result เมื่อกำหนด semantics หลัง report ถูกลบแล้ว |
| `measurement_request_recipients` | PK(request,user); FK cascade; matched time/decline; user/time index                                      | **ไม่พบจุดเสียชัดเจน:** ป้องกัน invitation ซ้ำและใช้ API ตรวจ owner/recipient; child rows โตตาม fanout ต้องกำหนดอายุ request/recipient ร่วมกัน                                                                                             |
| `measurement_delivery_leases`    | PK/FK outbox event cascade; lease_until; atomic lease upsert                                             | **ไม่พบจุดเสียชัดเจน:** มี lease ป้องกัน measurement workers ส่งพร้อมกันในช่วง lease; lease ไม่เท่ากับ exactly-once เมื่อ provider ส่งสำเร็จแต่ worker หยุดก่อนบันทึก ต้องรักษา retry key กับ provider                                     |

### Forecast และ model lifecycle — 13 ตาราง

| ตาราง                                  | หน้าที่และโครงสร้างที่ตรวจ                                                                                                        | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forecast_provider_sync_runs`          | PK UUID; provider/status CHECK; counters/metadata                                                                                 | **ปรับปรุง:** มีเพียง PK แต่ latest/retention ใช้ provider+started/completed_at ควร EXPLAIN ก่อนเพิ่ม indexes และตรวจ running ที่ค้าง                                                                                                               |
| `forecast_provider_snapshots`          | PK UUID; UNIQUE(station,provider,issued,valid); FK station cascade/run set null; PM>=0/unit CHECK; CAMS indexes                   | **ไม่พบจุดเสียชัดเจน:** แยก raw forecast จาก observation; bounded prune RPC จำกัด service_role ใช้ SKIP LOCKED; ต้องตรวจ reset triggers จริงบน production เพราะ repo มี replace function แต่ไม่มีต้นฉบับการติดตั้ง barrier ทั้งชุด                  |
| `forecast_consensus_latest`            | PK(station,horizon); interval/agreement checks; FK station                                                                        | **ปรับปรุง:** legacy consensus ไม่ควรนำ raw CAMS มาปนโดยไม่มี provenance; upper>=lower แล้วแต่ยังไม่บังคับ lower<=pm25<=upper พิจารณาตามนิยาม interval; ไม่ลบเพราะ pipeline pause อย่างเดียว                                                        |
| `forecast_prediction_sources`          | PK UUID; FK station; source/time/weight; station/generated index                                                                  | **ปรับปรุง:** ไม่มี FK เชื่อม prediction/run โดยตรง ใช้ station/horizon/generated ต้องรักษาความสอดคล้องตอนเขียน; ไม่พบ retention เฉพาะ provenance นี้ใน cleanup ปัจจุบัน                                                                            |
| `community_forecast_feature_snapshots` | PK UUID; FK station; report_ids UUID[]; sample size/weight/quality; station/generated index                                       | **ปรับปรุง:** array ของ report IDs ไม่มี FK รายตัว อย่าคาดว่า cascade ตาม report; เงื่อนไข Trust/fresh/corroboration ต้องตรวจใน algorithm ทุกครั้ง ไม่ใช่แค่มี ID อยู่ใน array                                                                      |
| `forecast_runs`                        | PK UUID; FK station; environment/feature metadata/generated_at                                                                    | **ปรับปรุง:** run กับ predictions เขียนแยก HTTP statements ถ้า child insert ล้มจะมี run ไม่ครบ; retention เลือกตาม generated_at แต่มีเพียง PK index ควรใช้ transaction และ EXPLAIN query retention                                                  |
| `forecast_predictions`                 | PK(run,horizon,variant); FK run cascade; unsettled partial index; metrics/error fields                                            | **ปรับปรุง:** ผูกกับ F ของ forecast_runs เรื่อง partial writes; schema ยังไม่บังคับช่วง horizon/PM/interval เทียบกับข้อกำหนดทั้งหมด ควรเพิ่มหลังตรวจข้อมูลเก่า; monitoring read มี limit และไม่มี pagination                                        |
| `forecast_data_quality_daily`          | PK(date,source,station); FK station; nonnegative quality counters                                                                 | **ไม่พบจุดเสียชัดเจน:** เป็นหลักฐานคุณภาพ source ไม่ใช่ disposable forecast output; reconciliation อ่าน source มี row limit ไม่มี pagination จึงต้องตรวจความครบเมื่อข้อมูลโต                                                                        |
| `forecast_evaluation_daily`            | composite PK date/env/horizon/method/station/district; metrics และ rows>=0                                                        | **ปรับปรุง:** ranges ของ accuracy/rates/coverage ยังไม่ CHECK; pipeline ที่สร้างสรุปต้องรับข้อมูลครบทุกหน้าและแยก source semantics ก่อนคำนวณ                                                                                                        |
| `forecast_drift_snapshots`             | PK UUID; unique(env,horizon,model_version,window_start,window_end); JSON drift                                                    | **ปรับปรุง:** model_version nullable ทำให้ UNIQUE ยอมให้ baseline window ซ้ำได้เมื่อเป็น NULL ถ้าต้องการหนึ่ง window จริงควรใช้ key ที่รวม NULL อย่างชัดเจน; ตรวจ window_end>window_start                                                           |
| `forecast_false_safe_reviews`          | composite PK/FK prediction cascade; disposition CHECK; note 10–1000; reviewer FK set null                                         | **ไม่พบจุดเสียชัดเจน:** key ตรง prediction และ review fields เหมาะสม; ระวัง retention ของ forecast_runs จะ cascade ลบ review ด้วย ต้องตรงกับอายุ safety audit ที่ต้องการ                                                                            |
| `model_registry`                       | release/env unique; CHECK lifecycle/environment/checksums; unique active partial index; runtime index; privileged transition RPCs | **ไม่พบจุดเสียชัดเจน** ในการจำกัด active model ต่อชื่อ/horizon/env; **ปรับปรุง:** current RPCs lock target row ก่อน advisory lock ของกลุ่ม ต้องทดสอบ concurrent transitions เพื่อหา lock-order/deadlock; ไม่อนุมานว่ามี active model จริงจาก schema |
| `forecast_release_decisions`           | PK UUID; FK registry/actor set null; decision CHECK; evidence/reason/time                                                         | **ไม่พบจุดเสียชัดเจน:** audit ถูก insert ใน transaction ของ transition; มีเพียง PK index ควร EXPLAIN list ตามเวลา/registry และรักษาประวัตินี้ขณะ retire model                                                                                       |

### Validation เฉพาะ staging/opt-in — 3 ตาราง

| ตาราง                                     | หน้าที่และโครงสร้างที่ตรวจ                                                                         | ผลรีวิว / สิ่งที่ควรทำ                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forecast_validation_snapshots`           | PK(station,collection_slot,valid_at); FK station; fetched_at<valid_at; provider เฉพาะ; private RLS | **ไม่พบจุดเสียชัดเจน:** กัน hindsight และ timestamp ซ้ำ; พิกัด requested/grid ยังไม่มี CHECK ช่วง ควรเพิ่มเมื่อทดสอบ collector; ต้องยืนยันว่าตารางอยู่ใน environment ที่ตั้งใจ        |
| `forecast_validation_hourly_observations` | PK(station,valid_at); FK station; source เฉพาะและ period=60; verified flag default false           | **ปรับปรุง:** verified=true ยังไม่บังคับ window_start/window_end ที่สอดคล้องกัน ควรทำให้ state verified มี constraints ชัด; ห้ามย้าย headline Air4Thai มาลงเพื่อเติมข้อมูลให้ดูครบ    |
| `forecast_validation_collection_runs`     | PK collection_slot; nonnegative counters; status CHECK; missing/issues JSON                        | **ไม่พบจุดเสียชัดเจน:** เหมาะกับตรวจ collection completeness; เพิ่ม complete_station_count<=station_count ได้; migration diagnostics ต้องตาม evidence ถึงแม้ชื่อไฟล์เรียงตัวอักษรก่อน |

## ผลตรวจและข้อจำกัด

- schema จำลอง 48 ตารางเปิด RLS ทุกตาราง; ไม่ได้จำลอง Supabase default grants ทั้งหมดหรือ production configuration
- ทดสอบ LINE orphan/FK mismatch และ anon execute ของ engagement RPC บน isolated PostgreSQL (PGlite)
- ทดสอบ duplicate notification UUID update ที่ชน outbox FK ได้ SQLSTATE 23503
- จำลอง failure ระหว่าง purge metadata สองตารางใน Python
- pytest ที่เกี่ยวข้องผ่าน **39 tests**: retention, engagement, stars, measurement requests, notifications, sync idempotency, roles, frontend privacy boundary
- ยังไม่มี concurrent database test ของ F4/F6; ข้อสรุปอิงลำดับคำสั่งและการไม่มี transaction/claim ใน code paths ที่ระบุ
- ยังไม่ได้ตรวจ live row counts, duplicate/orphan ใน production, pg_stat_statements, EXPLAIN ANALYZE, index usage/bloat, active jobs, migrations history, bucket policies หรือ reset triggers ที่ติดตั้งจริง
- ต้องใช้ migration ใหม่สำหรับการแก้ schema ที่ deploy แล้ว ไม่ rewrite migrations เดิม; ไม่ได้แก้ application code/schema หรือข้อมูลจริงในการรีวิวนี้
