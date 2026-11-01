# ClearPath — Data dictionary

Schema รุ่น 2: PK/FK ของข้อมูลภายในใช้ BIGINT; API ส่ง code เป็น string เช่น `RPT-000001`. สร้างจาก catalog โปรเจกต์ `kmvxwfrmmictzuxbsncr` ที่ตรวจสอบแล้ว 44 ตาราง. ดู [การย้ายไปโปรเจกต์ใหม่](../runbooks/fresh-project-2026-11-01.md).

UUID ที่เหลือใช้กับ Supabase Auth, token/lease/idempotency หรือคอลัมน์ `legacy_*` เพื่อรองรับข้อมูลและลิงก์เดิม. ใน schema เป้าหมายไม่มี UUID เป็น PK ของตาราง public. Sequence ข้ามเลขได้และไม่เริ่มใหม่ทุกปี; code มีอย่างน้อย 6 หลักและไม่ตัดเลขที่ยาวกว่า 6 หลัก.

## ภาพรวมตาราง

| ตาราง                            | หน้าที่                                                | Primary key                               | Code                                   |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------- | -------------------------------------- |
| `activities`                     | กิจกรรมหรือเนื้อหาประกอบชุมชน                          | `(id)`                                    | ACT-000001                             |
| `alert_events`                   | ประวัติการสร้างเหตุการณ์แจ้งเตือนเพื่อป้องกันการส่งซ้ำ | `(id)`                                    | ALT-000001                             |
| `announcements`                  | ประกาศของระบบ                                          | `(id)`                                    | ANN-000001                             |
| `audit_logs`                     | บันทึกตรวจสอบการทำงานย้อนหลัง                          | `(id)`                                    | AUD-000001                             |
| `cams_grid_active`               | ตัวชี้ generation ของพื้นผิว CAMS ที่กำลังให้บริการ    | `(id)`                                    | คีย์สัมพันธ์ / natural key / singleton |
| `cams_grid_chunks`               | ข้อมูลชั่วคราวระหว่างเก็บกริดทีละ batch                | `(job_id, batch_index)`                   | คีย์สัมพันธ์ / natural key / singleton |
| `cams_grid_definitions`          | นิยามแกนพิกัดกริดจากแหล่งข้อมูลภายนอก                  | `(id)`                                    | คีย์สัมพันธ์ / natural key / singleton |
| `cams_grid_frames`               | ค่าพยากรณ์ของกริดในแต่ละเวลา                           | `(generation_id, valid_at)`               | คีย์สัมพันธ์ / natural key / singleton |
| `cams_grid_generations`          | รอบข้อมูลกริดที่เผยแพร่พร้อมกันเป็นชุด                 | `(id)`                                    | CGN-000001                             |
| `cams_grid_jobs`                 | งานรวบรวมกริดและสถานะ lease/retry                      | `(id)`                                    | CGJ-000001                             |
| `capture_sessions`               | หลักฐาน session กล้องที่มีอายุสั้นและใช้ได้ครั้งเดียว  | `(id)`                                    | CAP-000001                             |
| `community_help_claims`          | การเริ่มช่วยวัดตามคำขอก่อนถ่ายภาพ                      | `(request_id, user_id)`                   | คีย์สัมพันธ์ / natural key / singleton |
| `community_reports`              | รายงาน PM2.5 พร้อมผลตัดสิน OCR และ Trust               | `(id)`                                    | RPT-000001                             |
| `community_xp_accounts`          | บัญชี XP และตัวตนสมาชิกสาธารณะแยกจากบัญชีเข้าสู่ระบบ   | `(user_id)`                               | MBR-000001 (member_id แยกจาก USR)      |
| `community_xp_control`           | สวิตช์และ maintenance ของ XP; ไม่ใช่รหัสรายการ         | `(singleton)`                             | คีย์สัมพันธ์ / natural key / singleton |
| `community_xp_events`            | สมุดรายการ XP แบบเก็บประวัติและ reversal               | `(id)`                                    | XPE-000001                             |
| `community_xp_jobs`              | คิวคำนวณ XP จากผลตัดสินรายงาน                          | `(report_id)`                             | คีย์สัมพันธ์ / natural key / singleton |
| `data_issue_reports`             | ปัญหาคุณภาพข้อมูลที่ผู้ใช้แจ้ง                         | `(id)`                                    | ISS-000001                             |
| `fire_feature_snapshots`         | snapshot satellite hotspot ประกอบการวิเคราะห์สถานี     | `(station_id, recorded_at)`               | คีย์สัมพันธ์ / natural key / singleton |
| `forecast_data_quality_daily`    | สรุปคุณภาพข้อมูลรายวันแยกแหล่งและสถานี                 | `(quality_date, source_name, station_id)` | คีย์สัมพันธ์ / natural key / singleton |
| `forecast_provider_snapshots`    | หลักฐานพยากรณ์ดิบจาก CAMS แยกสถานีและเวลา              | `(id)`                                    | CFS-000001                             |
| `forecast_provider_sync_runs`    | ประวัติการรับข้อมูลพยากรณ์จาก provider                 | `(id)`                                    | CPS-000001                             |
| `line_notification_links`        | การผูกบัญชีกับ LINE และสถานะ consent/การเชื่อมต่อ      | `(user_id)`                               | คีย์สัมพันธ์ / natural key / singleton |
| `line_webhook_events`            | รหัสเหตุการณ์ภายนอกสำหรับป้องกัน webhook ซ้ำ           | `(event_id)`                              | คีย์สัมพันธ์ / natural key / singleton |
| `measurement_delivery_leases`    | lease การส่งแจ้งเตือนคำขอวัด ป้องกัน worker ส่งชนกัน   | `(event_id)`                              | คีย์สัมพันธ์ / natural key / singleton |
| `measurement_helper_presence`    | สถานะอาสาช่วยวัดและ GPS ล่าสุดแบบ private              | `(user_id)`                               | คีย์สัมพันธ์ / natural key / singleton |
| `measurement_request_recipients` | รายชื่อผู้ได้รับคำเชิญและสถานะปฏิเสธคำขอ               | `(request_id, user_id)`                   | คีย์สัมพันธ์ / natural key / singleton |
| `measurement_requests`           | คำขอวัดตามสถานที่ ช่วงเวลา และรัศมี                    | `(id)`                                    | REQ-000001                             |
| `notification_outbox`            | คิวส่งข้อความพร้อม retry และ deduplication             | `(id)`                                    | OBX-000001                             |
| `notification_preferences`       | การตั้งค่าและ consent การแจ้งเตือน                     | `(user_id)`                               | คีย์สัมพันธ์ / natural key / singleton |
| `pm25_readings`                  | ประวัติค่าฝุ่นจากสถานีทางการ                           | `(id)`                                    | OBS-000001                             |
| `profiles`                       | บัญชีภายใน สิทธิ์ และคะแนนความน่าเชื่อถือ              | `(id)`                                    | USR-000001                             |
| `public_map_events`              | เหตุการณ์สำหรับอัปเดตข้อมูลบนแผนที่                    | `(id)`                                    | MAP-000001                             |
| `rate_limit_windows`             | จำนวนการเรียก action ในแต่ละช่วงเวลา                   | `(actor_key, action, window_started_at)`  | คีย์สัมพันธ์ / natural key / singleton |
| `report_comments`                | ความคิดเห็นต่อรายงาน                                   | `(id)`                                    | CMT-000001                             |
| `report_drafts`                  | ภาพและ OCR ระหว่างเตรียมส่งรายงาน                      | `(id)`                                    | DRF-000001                             |
| `report_evidence`                | หลักฐาน private แบบหนึ่งต่อหนึ่งกับรายงาน              | `(report_id)`                             | คีย์สัมพันธ์ / natural key / singleton |
| `report_reactions`               | ปฏิกิริยาต่อรายงาน หนึ่งรายการต่อผู้ใช้                | `(report_id, user_id)`                    | คีย์สัมพันธ์ / natural key / singleton |
| `report_reviews`                 | คำขอบคุณและดาวพร้อมหลักฐานระยะ GPS                     | `(id)`                                    | REV-000001                             |
| `reputation_events`              | ประวัติการเปลี่ยนคะแนน Trust/Reputation                | `(id)`                                    | REP-000001                             |
| `stations`                       | สถานีทางการ ใช้รหัสที่ provider กำหนด                  | `(id)`                                    | คีย์สัมพันธ์ / natural key / singleton |
| `sync_runs`                      | ประวัติการ sync Air4Thai                               | `(id)`                                    | SYN-000001                             |
| `user_notifications`             | กล่องแจ้งเตือนภายในระบบ                                | `(id)`                                    | NTF-000001                             |
| `weather_observations`           | ประวัติอากาศที่ผูกสถานีและเวลา                         | `(station_id, recorded_at)`               | คีย์สัมพันธ์ / natural key / singleton |

## กติกาคีย์และสิทธิ์

- `id` ของ entity ใช้ BIGINT; `code` เป็น generated column และมี UNIQUE constraint. ตารางเดิมที่ใช้ BIGSERIAL คงเลขเดิม.
- FK เช่น `report_id`, `user_id`, `request_id` ใช้ตัวเลขจริงในการ join. ตารางหนึ่งต่อหนึ่งและตารางเชื่อมใช้ PK/FK ร่วมกันตาม ERD.
- `profiles.auth_user_id` เป็น UUID UNIQUE NOT NULL ที่อ้างถึง `auth.users`. รหัส USR เป็นข้อมูลภายในและใช้แยกจากตัวตน MBR.
- `legacy_*` คงค่าเดิมไว้สำหรับ audit, privacy seed, retry และ URL เก่า. ไม่ใช่ PK/FK ของ feature ปัจจุบัน. `private.identifier_aliases` แยก namespace ของแต่ละ entity และไม่เปิดให้ browser.
- Historical references ใน XP/map events อาจไม่มี FK เพื่อเก็บประวัติหลังลบปลายทาง; ห้ามสร้างรายการใหม่เพียงเพื่อทำให้ reference ดูครบ.
- รหัสที่เดาได้ไม่ใช่สิทธิ์: API ยังตรวจผู้ส่ง/เจ้าของ/ผู้รับคำเชิญ และ RLS เชื่อมกับ auth_user_id.
- รหัสสถานี, grid definition, LINE webhook event และ security tokens คงรูปแบบจากแหล่งเดิม.
- `review` มี 44 security_invoker views สำหรับตรวจข้อมูลด้วย postgres/service_role ฝั่ง server; ไม่มีพิกัดจริง รูป private หรือ mapping MBR → USR ใน view บัญชีสมาชิก.

## คอลัมน์รายตาราง

### activities

กิจกรรมหรือเนื้อหาประกอบชุมชน.

| คอลัมน์         | Type          | Null | Default / generation                                                                       |
| --------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`     | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `title`         | `text`        | NO   | `—`                                                                                        |
| `description`   | `text`        | NO   | `—`                                                                                        |
| `rule_code`     | `text`        | YES  | `—`                                                                                        |
| `target_count`  | `integer`     | YES  | `—`                                                                                        |
| `reward_points` | `integer`     | NO   | `0`                                                                                        |
| `starts_at`     | `timestamptz` | YES  | `—`                                                                                        |
| `ends_at`       | `timestamptz` | YES  | `—`                                                                                        |
| `active`        | `boolean`     | NO   | `true`                                                                                     |
| `created_at`    | `timestamptz` | NO   | `now()`                                                                                    |
| `id`            | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`          | `text`        | YES  | `('ACT-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### alert_events

ประวัติการสร้างเหตุการณ์แจ้งเตือนเพื่อป้องกันการส่งซ้ำ.

| คอลัมน์             | Type               | Null | Default / generation                                                                       |
| ------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`         | `uuid`             | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `deduplication_key` | `text`             | NO   | `—`                                                                                        |
| `source`            | `text`             | NO   | `—`                                                                                        |
| `kind`              | `text`             | NO   | `—`                                                                                        |
| `severity`          | `text`             | NO   | `—`                                                                                        |
| `title`             | `text`             | NO   | `—`                                                                                        |
| `body`              | `text`             | NO   | `—`                                                                                        |
| `district`          | `text`             | YES  | `—`                                                                                        |
| `subdistrict`       | `text`             | YES  | `—`                                                                                        |
| `lat`               | `double precision` | YES  | `—`                                                                                        |
| `lon`               | `double precision` | YES  | `—`                                                                                        |
| `detected_at`       | `timestamptz`      | NO   | `—`                                                                                        |
| `sent_at`           | `timestamptz`      | YES  | `—`                                                                                        |
| `recipient_count`   | `integer`          | NO   | `0`                                                                                        |
| `payload`           | `jsonb`            | NO   | `'{}'::jsonb`                                                                              |
| `created_at`        | `timestamptz`      | NO   | `now()`                                                                                    |
| `id`                | `bigint`           | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`              | `text`             | YES  | `('ALT-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### announcements

ประกาศของระบบ.

| คอลัมน์             | Type          | Null | Default / generation                                                                       |
| ------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`         | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `title`             | `text`        | NO   | `—`                                                                                        |
| `body`              | `text`        | NO   | `—`                                                                                        |
| `kind`              | `text`        | NO   | `'community'::text`                                                                        |
| `severity`          | `text`        | NO   | `'info'::text`                                                                             |
| `area`              | `text`        | YES  | `—`                                                                                        |
| `district`          | `text`        | YES  | `—`                                                                                        |
| `subdistrict`       | `text`        | YES  | `—`                                                                                        |
| `published`         | `boolean`     | NO   | `false`                                                                                    |
| `published_at`      | `timestamptz` | NO   | `now()`                                                                                    |
| `expires_at`        | `timestamptz` | YES  | `—`                                                                                        |
| `status`            | `text`        | NO   | `'published'::text`                                                                        |
| `image_path`        | `text`        | YES  | `—`                                                                                        |
| `legacy_created_by` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_updated_by` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `created_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `updated_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `id`                | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`              | `text`        | YES  | `('ANN-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `created_by`        | `bigint`      | YES  | `—`                                                                                        |
| `updated_by`        | `bigint`      | YES  | `—`                                                                                        |

### audit_logs

บันทึกตรวจสอบการทำงานย้อนหลัง.

| คอลัมน์           | Type          | Null | Default / generation                                                                       |
| ----------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `id`              | `bigint`      | NO   | `nextval('audit_logs_id_seq'::regclass)`                                                   |
| `legacy_actor_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `action`          | `text`        | NO   | `—`                                                                                        |
| `entity_type`     | `text`        | NO   | `—`                                                                                        |
| `entity_id`       | `text`        | YES  | `—`                                                                                        |
| `details`         | `jsonb`       | NO   | `'{}'::jsonb`                                                                              |
| `created_at`      | `timestamptz` | NO   | `now()`                                                                                    |
| `code`            | `text`        | YES  | `('AUD-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `actor_id`        | `bigint`      | YES  | `—`                                                                                        |

### cams_grid_active

ตัวชี้ generation ของพื้นผิว CAMS ที่กำลังให้บริการ.

| คอลัมน์                | Type      | Null | Default / generation        |
| ---------------------- | --------- | ---- | --------------------------- |
| `id`                   | `integer` | NO   | `—`                         |
| `legacy_generation_id` | `uuid`    | YES  | `—; compatibility metadata` |
| `generation_id`        | `bigint`  | NO   | `—`                         |

### cams_grid_chunks

ข้อมูลชั่วคราวระหว่างเก็บกริดทีละ batch.

| คอลัมน์         | Type      | Null | Default / generation        |
| --------------- | --------- | ---- | --------------------------- |
| `legacy_job_id` | `uuid`    | YES  | `—; compatibility metadata` |
| `batch_index`   | `integer` | NO   | `—`                         |
| `payload`       | `jsonb`   | NO   | `—`                         |
| `job_id`        | `bigint`  | NO   | `—`                         |

### cams_grid_definitions

นิยามแกนพิกัดกริดจากแหล่งข้อมูลภายนอก.

| คอลัมน์      | Type                 | Null | Default / generation |
| ------------ | -------------------- | ---- | -------------------- |
| `id`         | `text`               | NO   | `—`                  |
| `latitudes`  | `double precision[]` | NO   | `—`                  |
| `longitudes` | `double precision[]` | NO   | `—`                  |

### cams_grid_frames

ค่าพยากรณ์ของกริดในแต่ละเวลา.

| คอลัมน์                | Type                 | Null | Default / generation        |
| ---------------------- | -------------------- | ---- | --------------------------- |
| `legacy_generation_id` | `uuid`               | YES  | `—; compatibility metadata` |
| `valid_at`             | `timestamptz`        | NO   | `—`                         |
| `values`               | `double precision[]` | NO   | `—`                         |
| `generation_id`        | `bigint`             | NO   | `—`                         |

### cams_grid_generations

รอบข้อมูลกริดที่เผยแพร่พร้อมกันเป็นชุด.

| คอลัมน์           | Type            | Null | Default / generation                                                                       |
| ----------------- | --------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`       | `uuid`          | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `grid_id`         | `text`          | NO   | `—`                                                                                        |
| `status`          | `text`          | NO   | `'staging'::text`                                                                          |
| `started_at`      | `timestamptz`   | NO   | `now()`                                                                                    |
| `retrieved_at`    | `timestamptz`   | YES  | `—`                                                                                        |
| `model_issued_at` | `timestamptz`   | YES  | `—`                                                                                        |
| `valid_times`     | `timestamptz[]` | NO   | `'{}'::timestamp with time zone[]`                                                         |
| `fingerprint`     | `text`          | YES  | `—`                                                                                        |
| `id`              | `bigint`        | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`            | `text`          | YES  | `('CGN-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### cams_grid_jobs

งานรวบรวมกริดและสถานะ lease/retry.

| คอลัมน์                | Type          | Null | Default / generation                                                                       |
| ---------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`            | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `slot`                 | `timestamptz` | NO   | `—`                                                                                        |
| `legacy_generation_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `status`               | `text`        | NO   | `'running'::text`                                                                          |
| `next_batch`           | `integer`     | NO   | `0`                                                                                        |
| `batch_count`          | `integer`     | NO   | `—`                                                                                        |
| `lease_token`          | `uuid`        | YES  | `—`                                                                                        |
| `lease_until`          | `timestamptz` | YES  | `—`                                                                                        |
| `attempts`             | `integer`     | NO   | `0`                                                                                        |
| `created_at`           | `timestamptz` | NO   | `now()`                                                                                    |
| `completed_at`         | `timestamptz` | YES  | `—`                                                                                        |
| `last_error`           | `boolean`     | NO   | `false`                                                                                    |
| `id`                   | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                 | `text`        | YES  | `('CGJ-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `generation_id`        | `bigint`      | YES  | `—`                                                                                        |

### capture_sessions

หลักฐาน session กล้องที่มีอายุสั้นและใช้ได้ครั้งเดียว.

| คอลัมน์          | Type          | Null | Default / generation                                                                       |
| ---------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`      | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `issued_at`      | `timestamptz` | NO   | `—`                                                                                        |
| `expires_at`     | `timestamptz` | NO   | `—`                                                                                        |
| `consumed_at`    | `timestamptz` | YES  | `—`                                                                                        |
| `created_at`     | `timestamptz` | NO   | `now()`                                                                                    |
| `id`             | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`           | `text`        | YES  | `('CAP-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `user_id`        | `bigint`      | NO   | `—`                                                                                        |

### community_help_claims

การเริ่มช่วยวัดตามคำขอก่อนถ่ายภาพ.

| คอลัมน์             | Type          | Null | Default / generation        |
| ------------------- | ------------- | ---- | --------------------------- |
| `legacy_request_id` | `uuid`        | YES  | `—; compatibility metadata` |
| `legacy_user_id`    | `uuid`        | YES  | `—; compatibility metadata` |
| `started_at`        | `timestamptz` | NO   | `now()`                     |
| `request_id`        | `bigint`      | NO   | `—`                         |
| `user_id`           | `bigint`      | NO   | `—`                         |

### community_reports

รายงาน PM2.5 พร้อมผลตัดสิน OCR และ Trust.

| คอลัมน์                         | Type               | Null | Default / generation                                                                       |
| ------------------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`                     | `uuid`             | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`                | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `display_name`                  | `text`             | YES  | `—`                                                                                        |
| `lat`                           | `double precision` | NO   | `—`                                                                                        |
| `lon`                           | `double precision` | NO   | `—`                                                                                        |
| `province`                      | `text`             | NO   | `'นครปฐม'::text`                                                                           |
| `district`                      | `text`             | YES  | `—`                                                                                        |
| `subdistrict`                   | `text`             | YES  | `—`                                                                                        |
| `pm25`                          | `double precision` | YES  | `—`                                                                                        |
| `ocr_pm25`                      | `double precision` | YES  | `—`                                                                                        |
| `ocr_confidence`                | `double precision` | NO   | `0`                                                                                        |
| `ocr_raw_text`                  | `text`             | YES  | `—`                                                                                        |
| `device_detected`               | `boolean`          | NO   | `false`                                                                                    |
| `display_clear`                 | `boolean`          | NO   | `false`                                                                                    |
| `capture_source`                | `text`             | NO   | `'camera'::text`                                                                           |
| `legacy_capture_session_id`     | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `image_path`                    | `text`             | YES  | `—`                                                                                        |
| `image_sha256`                  | `text`             | YES  | `—`                                                                                        |
| `image_ahash`                   | `text`             | YES  | `—`                                                                                        |
| `burst_hashes`                  | `jsonb`            | NO   | `'[]'::jsonb`                                                                              |
| `legacy_duplicate_of_report_id` | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `device_model`                  | `text`             | YES  | `—`                                                                                        |
| `device_serial`                 | `text`             | YES  | `—`                                                                                        |
| `device_calibrated`             | `boolean`          | NO   | `false`                                                                                    |
| `calibration_evidence_path`     | `text`             | YES  | `—`                                                                                        |
| `calibrated_at`                 | `date`             | YES  | `—`                                                                                        |
| `averaging_period`              | `text`             | NO   | `'instant'::text`                                                                          |
| `measurement_duration_seconds`  | `integer`          | NO   | `0`                                                                                        |
| `measurement_environment`       | `text`             | NO   | `'outdoor'::text`                                                                          |
| `measurement_stable`            | `boolean`          | NO   | `true`                                                                                     |
| `near_emission_source`          | `boolean`          | NO   | `false`                                                                                    |
| `measurement_note`              | `text`             | YES  | `—`                                                                                        |
| `gps_accuracy_m`                | `double precision` | YES  | `—`                                                                                        |
| `captured_at`                   | `timestamptz`      | NO   | `—`                                                                                        |
| `status`                        | `text`             | NO   | `'pending'::text`                                                                          |
| `base_trust_score`              | `double precision` | NO   | `0`                                                                                        |
| `trust_score`                   | `double precision` | NO   | `0`                                                                                        |
| `trust_reasons`                 | `jsonb`            | NO   | `'[]'::jsonb`                                                                              |
| `peer_up`                       | `integer`          | NO   | `0`                                                                                        |
| `peer_down`                     | `integer`          | NO   | `0`                                                                                        |
| `legacy_moderated_by`           | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `moderation_note`               | `text`             | YES  | `—`                                                                                        |
| `moderated_at`                  | `timestamptz`      | YES  | `—`                                                                                        |
| `retention_until`               | `timestamptz`      | YES  | `—`                                                                                        |
| `audit_hold`                    | `boolean`          | NO   | `false`                                                                                    |
| `created_at`                    | `timestamptz`      | NO   | `now()`                                                                                    |
| `updated_at`                    | `timestamptz`      | NO   | `now()`                                                                                    |
| `user_claimed_pm25`             | `double precision` | YES  | `—`                                                                                        |
| `admin_verified_pm25`           | `double precision` | YES  | `—`                                                                                        |
| `public_lat`                    | `double precision` | YES  | `—`                                                                                        |
| `public_lon`                    | `double precision` | YES  | `—`                                                                                        |
| `camera_session_issued_at`      | `timestamptz`      | YES  | `—`                                                                                        |
| `client_captured_at`            | `timestamptz`      | YES  | `—`                                                                                        |
| `server_received_at`            | `timestamptz`      | NO   | `now()`                                                                                    |
| `clock_warning`                 | `boolean`          | NO   | `false`                                                                                    |
| `ocr_mismatch`                  | `boolean`          | NO   | `false`                                                                                    |
| `rejection_reason_code`         | `text`             | YES  | `—`                                                                                        |
| `moderation_checks`             | `jsonb`            | NO   | `'{}'::jsonb`                                                                              |
| `evidence_purged_at`            | `timestamptz`      | YES  | `—`                                                                                        |
| `rating_count`                  | `integer`          | NO   | `0`                                                                                        |
| `rating_average`                | `double precision` | YES  | `—`                                                                                        |
| `policy_version`                | `text`             | NO   | `'trust-v1'::text`                                                                         |
| `source_type`                   | `text`             | NO   | `'individual'::text`                                                                       |
| `show_reporter_profile`         | `boolean`          | NO   | `false`                                                                                    |
| `reporter_avatar_url`           | `text`             | YES  | `—`                                                                                        |
| `like_count`                    | `integer`          | NO   | `0`                                                                                        |
| `dislike_count`                 | `integer`          | NO   | `0`                                                                                        |
| `comment_count`                 | `integer`          | NO   | `0`                                                                                        |
| `image_metadata`                | `jsonb`            | NO   | `'{}'::jsonb`                                                                              |
| `id`                            | `bigint`           | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                          | `text`             | YES  | `('RPT-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `capture_session_id`            | `bigint`           | NO   | `—`                                                                                        |
| `duplicate_of_report_id`        | `bigint`           | YES  | `—`                                                                                        |
| `moderated_by`                  | `bigint`           | YES  | `—`                                                                                        |
| `user_id`                       | `bigint`           | NO   | `—`                                                                                        |

### community_xp_accounts

บัญชี XP และตัวตนสมาชิกสาธารณะแยกจากบัญชีเข้าสู่ระบบ.

| คอลัมน์            | Type          | Null | Default / generation                                                                                             |
| ------------------ | ------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `legacy_user_id`   | `uuid`        | YES  | `—; compatibility metadata`                                                                                      |
| `legacy_member_id` | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                                      |
| `alias`            | `text`        | NO   | `('สมาชิก CP-'::text &#124;&#124; upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8)))` |
| `hidden`           | `boolean`     | NO   | `false`                                                                                                          |
| `created_at`       | `timestamptz` | NO   | `now()`                                                                                                          |
| `member_id`        | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                                                    |
| `member_code`      | `text`        | YES  | `('MBR-'::text &#124;&#124; lpad((member_id)::text, GREATEST(6, length((member_id)::text)), '0'::text))`         |
| `user_id`          | `bigint`      | NO   | `—`                                                                                                              |

### community_xp_control

สวิตช์และ maintenance ของ XP; ไม่ใช่รหัสรายการ.

| คอลัมน์          | Type      | Null | Default / generation |
| ---------------- | --------- | ---- | -------------------- |
| `singleton`      | `boolean` | NO   | `true`               |
| `enabled`        | `boolean` | NO   | `false`              |
| `maintenance`    | `boolean` | NO   | `false`              |
| `reset_version`  | `uuid`    | NO   | `gen_random_uuid()`  |
| `reset_manifest` | `text`    | YES  | `—`                  |

### community_xp_events

สมุดรายการ XP แบบเก็บประวัติและ reversal.

| คอลัมน์               | Type          | Null | Default / generation                                                                       |
| --------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`           | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`      | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_report_id`    | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_request_id`   | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_requester_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `kind`                | `text`        | NO   | `—`                                                                                        |
| `points`              | `integer`     | NO   | `—`                                                                                        |
| `reason`              | `text`        | NO   | `—`                                                                                        |
| `occurred_at`         | `timestamptz` | NO   | `—`                                                                                        |
| `recorded_at`         | `timestamptz` | NO   | `now()`                                                                                    |
| `policy_version`      | `text`        | NO   | `'xp-v1'::text`                                                                            |
| `legacy_reverses`     | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `id`                  | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                | `text`        | YES  | `('XPE-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `report_id`           | `bigint`      | YES  | `—`                                                                                        |
| `request_id`          | `bigint`      | YES  | `—`                                                                                        |
| `requester_id`        | `bigint`      | YES  | `—`                                                                                        |
| `reverses`            | `bigint`      | YES  | `—`                                                                                        |
| `user_id`             | `bigint`      | NO   | `—`                                                                                        |

### community_xp_jobs

คิวคำนวณ XP จากผลตัดสินรายงาน.

| คอลัมน์             | Type          | Null | Default / generation        |
| ------------------- | ------------- | ---- | --------------------------- |
| `legacy_report_id`  | `uuid`        | YES  | `—; compatibility metadata` |
| `legacy_user_id`    | `uuid`        | YES  | `—; compatibility metadata` |
| `occurred_at`       | `timestamptz` | NO   | `—`                         |
| `report_snapshot`   | `jsonb`       | NO   | `—`                         |
| `evidence_snapshot` | `jsonb`       | NO   | `—`                         |
| `state`             | `text`        | NO   | `'pending'::text`           |
| `processed_at`      | `timestamptz` | YES  | `—`                         |
| `report_id`         | `bigint`      | NO   | `—`                         |
| `user_id`           | `bigint`      | NO   | `—`                         |

### data_issue_reports

ปัญหาคุณภาพข้อมูลที่ผู้ใช้แจ้ง.

| คอลัมน์          | Type          | Null | Default / generation                                                                       |
| ---------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`      | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `category`       | `text`        | NO   | `—`                                                                                        |
| `reference_id`   | `text`        | YES  | `—`                                                                                        |
| `message`        | `text`        | NO   | `—`                                                                                        |
| `status`         | `text`        | NO   | `'new'::text`                                                                              |
| `created_at`     | `timestamptz` | NO   | `now()`                                                                                    |
| `updated_at`     | `timestamptz` | NO   | `now()`                                                                                    |
| `id`             | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`           | `text`        | YES  | `('ISS-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `user_id`        | `bigint`      | NO   | `—`                                                                                        |

### fire_feature_snapshots

snapshot satellite hotspot ประกอบการวิเคราะห์สถานี.

| คอลัมน์                | Type               | Null | Default / generation |
| ---------------------- | ------------------ | ---- | -------------------- |
| `station_id`           | `text`             | NO   | `—`                  |
| `recorded_at`          | `timestamptz`      | NO   | `—`                  |
| `hotspot_count`        | `integer`          | NO   | `0`                  |
| `weighted_frp`         | `double precision` | NO   | `0`                  |
| `upwind_hotspot_count` | `integer`          | NO   | `0`                  |
| `source_at`            | `timestamptz`      | NO   | `—`                  |
| `ingested_at`          | `timestamptz`      | NO   | `now()`              |
| `source_status`        | `text`             | NO   | `'observed'::text`   |

### forecast_data_quality_daily

สรุปคุณภาพข้อมูลรายวันแยกแหล่งและสถานี.

| คอลัมน์            | Type          | Null | Default / generation |
| ------------------ | ------------- | ---- | -------------------- |
| `quality_date`     | `date`        | NO   | `—`                  |
| `source_name`      | `text`        | NO   | `—`                  |
| `station_id`       | `text`        | NO   | `—`                  |
| `expected_hours`   | `integer`     | NO   | `—`                  |
| `observed_hours`   | `integer`     | NO   | `—`                  |
| `missing_hours`    | `integer`     | NO   | `—`                  |
| `duplicate_hours`  | `integer`     | NO   | `—`                  |
| `invalid_rows`     | `integer`     | NO   | `—`                  |
| `newest_source_at` | `timestamptz` | YES  | `—`                  |
| `details`          | `jsonb`       | NO   | `'{}'::jsonb`        |
| `reconciled_at`    | `timestamptz` | NO   | `now()`              |

### forecast_provider_snapshots

หลักฐานพยากรณ์ดิบจาก CAMS แยกสถานีและเวลา.

| คอลัมน์              | Type               | Null | Default / generation                                                                       |
| -------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`          | `uuid`             | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_sync_run_id` | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `station_id`         | `text`             | NO   | `—`                                                                                        |
| `provider`           | `text`             | NO   | `—`                                                                                        |
| `issued_at`          | `timestamptz`      | NO   | `—`                                                                                        |
| `forecast_at`        | `timestamptz`      | NO   | `—`                                                                                        |
| `horizon_hours`      | `integer`          | NO   | `—`                                                                                        |
| `pm25`               | `double precision` | NO   | `—`                                                                                        |
| `unit`               | `text`             | NO   | `'µg/m³'::text`                                                                            |
| `raw_metadata`       | `jsonb`            | NO   | `'{}'::jsonb`                                                                              |
| `created_at`         | `timestamptz`      | NO   | `now()`                                                                                    |
| `id`                 | `bigint`           | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`               | `text`             | YES  | `('CFS-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `sync_run_id`        | `bigint`           | YES  | `—`                                                                                        |

### forecast_provider_sync_runs

ประวัติการรับข้อมูลพยากรณ์จาก provider.

| คอลัมน์          | Type          | Null | Default / generation                                                                       |
| ---------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`      | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `provider`       | `text`        | NO   | `—`                                                                                        |
| `status`         | `text`        | NO   | `—`                                                                                        |
| `station_count`  | `integer`     | NO   | `0`                                                                                        |
| `snapshot_count` | `integer`     | NO   | `0`                                                                                        |
| `error_count`    | `integer`     | NO   | `0`                                                                                        |
| `error_message`  | `text`        | YES  | `—`                                                                                        |
| `started_at`     | `timestamptz` | NO   | `now()`                                                                                    |
| `completed_at`   | `timestamptz` | YES  | `—`                                                                                        |
| `metadata`       | `jsonb`       | NO   | `'{}'::jsonb`                                                                              |
| `id`             | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`           | `text`        | YES  | `('CPS-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### line_notification_links

การผูกบัญชีกับ LINE และสถานะ consent/การเชื่อมต่อ.

| คอลัมน์                | Type          | Null | Default / generation        |
| ---------------------- | ------------- | ---- | --------------------------- |
| `legacy_user_id`       | `uuid`        | YES  | `—; compatibility metadata` |
| `line_user_id`         | `text`        | YES  | `—`                         |
| `link_code_hash`       | `text`        | YES  | `—`                         |
| `link_code_expires_at` | `timestamptz` | YES  | `—`                         |
| `active`               | `boolean`     | NO   | `false`                     |
| `linked_at`            | `timestamptz` | YES  | `—`                         |
| `created_at`           | `timestamptz` | NO   | `now()`                     |
| `updated_at`           | `timestamptz` | NO   | `now()`                     |
| `user_id`              | `bigint`      | NO   | `—`                         |

### line_webhook_events

รหัสเหตุการณ์ภายนอกสำหรับป้องกัน webhook ซ้ำ.

| คอลัมน์        | Type          | Null | Default / generation           |
| -------------- | ------------- | ---- | ------------------------------ |
| `event_id`     | `text`        | NO   | `—`                            |
| `processed_at` | `timestamptz` | NO   | `now()`                        |
| `expires_at`   | `timestamptz` | NO   | `(now() + '7 days'::interval)` |

### measurement_delivery_leases

lease การส่งแจ้งเตือนคำขอวัด ป้องกัน worker ส่งชนกัน.

| คอลัมน์           | Type          | Null | Default / generation        |
| ----------------- | ------------- | ---- | --------------------------- |
| `legacy_event_id` | `uuid`        | YES  | `—; compatibility metadata` |
| `lease_until`     | `timestamptz` | NO   | `—`                         |
| `event_id`        | `bigint`      | NO   | `—`                         |

### measurement_helper_presence

สถานะอาสาช่วยวัดและ GPS ล่าสุดแบบ private.

| คอลัมน์          | Type               | Null | Default / generation        |
| ---------------- | ------------------ | ---- | --------------------------- |
| `legacy_user_id` | `uuid`             | YES  | `—; compatibility metadata` |
| `enabled`        | `boolean`          | NO   | `false`                     |
| `lat`            | `double precision` | YES  | `—`                         |
| `lon`            | `double precision` | YES  | `—`                         |
| `accuracy_m`     | `double precision` | YES  | `—`                         |
| `observed_at`    | `timestamptz`      | YES  | `—`                         |
| `updated_at`     | `timestamptz`      | NO   | `now()`                     |
| `user_id`        | `bigint`           | NO   | `—`                         |

### measurement_request_recipients

รายชื่อผู้ได้รับคำเชิญและสถานะปฏิเสธคำขอ.

| คอลัมน์               | Type          | Null | Default / generation        |
| --------------------- | ------------- | ---- | --------------------------- |
| `legacy_request_id`   | `uuid`        | YES  | `—; compatibility metadata` |
| `legacy_user_id`      | `uuid`        | YES  | `—; compatibility metadata` |
| `matched_location_at` | `timestamptz` | NO   | `—`                         |
| `declined`            | `boolean`     | NO   | `false`                     |
| `created_at`          | `timestamptz` | NO   | `now()`                     |
| `request_id`          | `bigint`      | NO   | `—`                         |
| `user_id`             | `bigint`      | NO   | `—`                         |

### measurement_requests

คำขอวัดตามสถานที่ ช่วงเวลา และรัศมี.

| คอลัมน์                   | Type               | Null | Default / generation                                                                       |
| ------------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`               | `uuid`             | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`          | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `idempotency_key`         | `uuid`             | NO   | `—`                                                                                        |
| `fingerprint`             | `text`             | NO   | `—`                                                                                        |
| `place_name`              | `text`             | NO   | `—`                                                                                        |
| `lat`                     | `double precision` | NO   | `—`                                                                                        |
| `lon`                     | `double precision` | NO   | `—`                                                                                        |
| `radius_km`               | `integer`          | NO   | `—`                                                                                        |
| `starts_at`               | `timestamptz`      | NO   | `—`                                                                                        |
| `expires_at`              | `timestamptz`      | NO   | `—`                                                                                        |
| `legacy_dispatch_cursor`  | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `last_processed_at`       | `timestamptz`      | YES  | `—`                                                                                        |
| `status`                  | `text`             | NO   | `—`                                                                                        |
| `legacy_result_report_id` | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `created_at`              | `timestamptz`      | NO   | `now()`                                                                                    |
| `updated_at`              | `timestamptz`      | NO   | `now()`                                                                                    |
| `id`                      | `bigint`           | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                    | `text`             | YES  | `('REQ-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `dispatch_cursor`         | `bigint`           | YES  | `—`                                                                                        |
| `result_report_id`        | `bigint`           | YES  | `—`                                                                                        |
| `user_id`                 | `bigint`           | NO   | `—`                                                                                        |

### notification_outbox

คิวส่งข้อความพร้อม retry และ deduplication.

| คอลัมน์                  | Type          | Null | Default / generation                                                                       |
| ------------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`              | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`         | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_notification_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `event_key`              | `text`        | NO   | `—`                                                                                        |
| `payload`                | `jsonb`       | NO   | `—`                                                                                        |
| `status`                 | `text`        | NO   | `'pending'::text`                                                                          |
| `attempts`               | `integer`     | NO   | `0`                                                                                        |
| `next_attempt_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `last_error`             | `text`        | YES  | `—`                                                                                        |
| `processed_at`           | `timestamptz` | YES  | `—`                                                                                        |
| `created_at`             | `timestamptz` | NO   | `now()`                                                                                    |
| `updated_at`             | `timestamptz` | NO   | `now()`                                                                                    |
| `id`                     | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                   | `text`        | YES  | `('OBX-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `notification_id`        | `bigint`      | YES  | `—`                                                                                        |
| `user_id`                | `bigint`      | NO   | `—`                                                                                        |

### notification_preferences

การตั้งค่าและ consent การแจ้งเตือน.

| คอลัมน์                | Type               | Null | Default / generation        |
| ---------------------- | ------------------ | ---- | --------------------------- |
| `legacy_user_id`       | `uuid`             | YES  | `—; compatibility metadata` |
| `district`             | `text`             | YES  | `—`                         |
| `subdistrict`          | `text`             | YES  | `—`                         |
| `radius_km`            | `double precision` | YES  | `—`                         |
| `center_lat`           | `double precision` | YES  | `—`                         |
| `center_lon`           | `double precision` | YES  | `—`                         |
| `pm25_threshold`       | `double precision` | NO   | `37.5`                      |
| `air_alerts`           | `boolean`          | NO   | `true`                      |
| `hotspot_alerts`       | `boolean`          | NO   | `true`                      |
| `community_alerts`     | `boolean`          | NO   | `false`                     |
| `updated_at`           | `timestamptz`      | NO   | `now()`                     |
| `report_status_alerts` | `boolean`          | NO   | `true`                      |
| `rating_alerts`        | `boolean`          | NO   | `true`                      |
| `reward_alerts`        | `boolean`          | NO   | `true`                      |
| `leaderboard_alerts`   | `boolean`          | NO   | `false`                     |
| `announcement_alerts`  | `boolean`          | NO   | `true`                      |
| `line_enabled`         | `boolean`          | NO   | `true`                      |
| `web_push_enabled`     | `boolean`          | NO   | `true`                      |
| `quiet_hours_start`    | `text`             | YES  | `'22:00'::text`             |
| `quiet_hours_end`      | `text`             | YES  | `'07:00'::text`             |
| `timezone`             | `text`             | NO   | `'Asia/Bangkok'::text`      |
| `consent_granted`      | `boolean`          | NO   | `false`                     |
| `consent_granted_at`   | `timestamptz`      | YES  | `—`                         |
| `user_id`              | `bigint`           | NO   | `—`                         |

### pm25_readings

ประวัติค่าฝุ่นจากสถานีทางการ.

| คอลัมน์         | Type               | Null | Default / generation                                                                       |
| --------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `id`            | `bigint`           | NO   | `nextval('pm25_readings_id_seq'::regclass)`                                                |
| `station_id`    | `text`             | YES  | `—`                                                                                        |
| `pm25`          | `double precision` | YES  | `—`                                                                                        |
| `aqi`           | `integer`          | YES  | `—`                                                                                        |
| `recorded_at`   | `timestamptz`      | NO   | `—`                                                                                        |
| `created_at`    | `timestamptz`      | YES  | `now()`                                                                                    |
| `source_at`     | `timestamptz`      | NO   | `—`                                                                                        |
| `ingested_at`   | `timestamptz`      | NO   | `now()`                                                                                    |
| `source_status` | `text`             | NO   | `'observed'::text`                                                                         |
| `code`          | `text`             | YES  | `('OBS-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### profiles

บัญชีภายใน สิทธิ์ และคะแนนความน่าเชื่อถือ.

| คอลัมน์             | Type          | Null | Default / generation                                                                       |
| ------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`         | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `display_name`      | `text`        | YES  | `—`                                                                                        |
| `role`              | `text`        | NO   | `'user'::text`                                                                             |
| `reputation_score`  | `integer`     | NO   | `0`                                                                                        |
| `approved_reports`  | `integer`     | NO   | `0`                                                                                        |
| `helpful_reviews`   | `integer`     | NO   | `0`                                                                                        |
| `created_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `updated_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `avatar_url`        | `text`        | YES  | `—`                                                                                        |
| `identity_provider` | `text`        | YES  | `—`                                                                                        |
| `id`                | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`              | `text`        | YES  | `('USR-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `auth_user_id`      | `uuid`        | NO   | `—`                                                                                        |

### public_map_events

เหตุการณ์สำหรับอัปเดตข้อมูลบนแผนที่.

| คอลัมน์            | Type          | Null | Default / generation                                                                       |
| ------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`        | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `event_type`       | `text`        | NO   | `—`                                                                                        |
| `legacy_entity_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `created_at`       | `timestamptz` | NO   | `now()`                                                                                    |
| `id`               | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`             | `text`        | YES  | `('MAP-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `entity_id`        | `bigint`      | YES  | `—`                                                                                        |

### rate_limit_windows

จำนวนการเรียก action ในแต่ละช่วงเวลา.

| คอลัมน์             | Type          | Null | Default / generation |
| ------------------- | ------------- | ---- | -------------------- |
| `actor_key`         | `text`        | NO   | `—`                  |
| `action`            | `text`        | NO   | `—`                  |
| `window_started_at` | `timestamptz` | NO   | `—`                  |
| `request_count`     | `integer`     | NO   | `0`                  |

### report_comments

ความคิดเห็นต่อรายงาน.

| คอลัมน์            | Type          | Null | Default / generation                                                                       |
| ------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`        | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_report_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_user_id`   | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `body`             | `text`        | NO   | `—`                                                                                        |
| `status`           | `text`        | NO   | `'published'::text`                                                                        |
| `created_at`       | `timestamptz` | NO   | `now()`                                                                                    |
| `updated_at`       | `timestamptz` | NO   | `now()`                                                                                    |
| `id`               | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`             | `text`        | YES  | `('CMT-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `report_id`        | `bigint`      | NO   | `—`                                                                                        |
| `user_id`          | `bigint`      | NO   | `—`                                                                                        |

### report_drafts

ภาพและ OCR ระหว่างเตรียมส่งรายงาน.

| คอลัมน์                         | Type               | Null | Default / generation                                                                       |
| ------------------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`                     | `uuid`             | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`                | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `legacy_capture_session_id`     | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `exact_lat`                     | `double precision` | NO   | `—`                                                                                        |
| `exact_lon`                     | `double precision` | NO   | `—`                                                                                        |
| `gps_accuracy_m`                | `double precision` | YES  | `—`                                                                                        |
| `camera_session_issued_at`      | `timestamptz`      | NO   | `—`                                                                                        |
| `client_captured_at`            | `timestamptz`      | NO   | `—`                                                                                        |
| `effective_captured_at`         | `timestamptz`      | NO   | `—`                                                                                        |
| `server_received_at`            | `timestamptz`      | NO   | `now()`                                                                                    |
| `clock_warning`                 | `boolean`          | NO   | `false`                                                                                    |
| `image_path`                    | `text`             | NO   | `—`                                                                                        |
| `image_sha256`                  | `text`             | NO   | `—`                                                                                        |
| `image_ahash`                   | `text`             | YES  | `—`                                                                                        |
| `burst_hashes`                  | `jsonb`            | NO   | `'[]'::jsonb`                                                                              |
| `legacy_duplicate_of_report_id` | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `ocr_pm25`                      | `double precision` | YES  | `—`                                                                                        |
| `ocr_confidence`                | `double precision` | NO   | `0`                                                                                        |
| `ocr_raw_text`                  | `text`             | YES  | `—`                                                                                        |
| `device_detected`               | `boolean`          | NO   | `false`                                                                                    |
| `display_clear`                 | `boolean`          | NO   | `false`                                                                                    |
| `expires_at`                    | `timestamptz`      | NO   | `—`                                                                                        |
| `submitted_at`                  | `timestamptz`      | YES  | `—`                                                                                        |
| `created_at`                    | `timestamptz`      | NO   | `now()`                                                                                    |
| `ocr_status`                    | `text`             | NO   | `'unavailable'::text`                                                                      |
| `unexpected_exif`               | `boolean`          | NO   | `false`                                                                                    |
| `capture_source`                | `text`             | NO   | `'camera'::text`                                                                           |
| `image_metadata`                | `jsonb`            | NO   | `'{}'::jsonb`                                                                              |
| `original_image_path`           | `text`             | YES  | `—`                                                                                        |
| `id`                            | `bigint`           | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`                          | `text`             | YES  | `('DRF-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `capture_session_id`            | `bigint`           | NO   | `—`                                                                                        |
| `duplicate_of_report_id`        | `bigint`           | YES  | `—`                                                                                        |
| `user_id`                       | `bigint`           | NO   | `—`                                                                                        |

### report_evidence

หลักฐาน private แบบหนึ่งต่อหนึ่งกับรายงาน.

| คอลัมน์                     | Type               | Null | Default / generation        |
| --------------------------- | ------------------ | ---- | --------------------------- |
| `legacy_report_id`          | `uuid`             | YES  | `—; compatibility metadata` |
| `exact_lat`                 | `double precision` | YES  | `—`                         |
| `exact_lon`                 | `double precision` | YES  | `—`                         |
| `gps_accuracy_m`            | `double precision` | YES  | `—`                         |
| `legacy_capture_session_id` | `uuid`             | YES  | `—; compatibility metadata` |
| `camera_session_issued_at`  | `timestamptz`      | YES  | `—`                         |
| `client_captured_at`        | `timestamptz`      | YES  | `—`                         |
| `server_received_at`        | `timestamptz`      | NO   | `now()`                     |
| `image_path`                | `text`             | YES  | `—`                         |
| `image_sha256`              | `text`             | YES  | `—`                         |
| `image_ahash`               | `text`             | YES  | `—`                         |
| `burst_hashes`              | `jsonb`            | NO   | `'[]'::jsonb`               |
| `ocr_raw_text`              | `text`             | YES  | `—`                         |
| `retention_until`           | `timestamptz`      | YES  | `—`                         |
| `purged_at`                 | `timestamptz`      | YES  | `—`                         |
| `audit_hold`                | `boolean`          | NO   | `false`                     |
| `created_at`                | `timestamptz`      | NO   | `now()`                     |
| `ocr_status`                | `text`             | NO   | `'unavailable'::text`       |
| `unexpected_exif`           | `boolean`          | NO   | `false`                     |
| `image_metadata`            | `jsonb`            | NO   | `'{}'::jsonb`               |
| `original_image_path`       | `text`             | YES  | `—`                         |
| `capture_session_id`        | `bigint`           | YES  | `—`                         |
| `report_id`                 | `bigint`           | NO   | `—`                         |

### report_reactions

ปฏิกิริยาต่อรายงาน หนึ่งรายการต่อผู้ใช้.

| คอลัมน์            | Type          | Null | Default / generation        |
| ------------------ | ------------- | ---- | --------------------------- |
| `legacy_report_id` | `uuid`        | YES  | `—; compatibility metadata` |
| `legacy_user_id`   | `uuid`        | YES  | `—; compatibility metadata` |
| `reaction`         | `text`        | NO   | `—`                         |
| `created_at`       | `timestamptz` | NO   | `now()`                     |
| `updated_at`       | `timestamptz` | NO   | `now()`                     |
| `report_id`        | `bigint`      | NO   | `—`                         |
| `user_id`          | `bigint`      | NO   | `—`                         |

### report_reviews

คำขอบคุณและดาวพร้อมหลักฐานระยะ GPS.

| คอลัมน์                | Type               | Null | Default / generation                                                                       |
| ---------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------ |
| `id`                   | `bigint`           | NO   | `nextval('report_reviews_id_seq'::regclass)`                                               |
| `legacy_report_id`     | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `legacy_reviewer_id`   | `uuid`             | YES  | `—; compatibility metadata`                                                                |
| `verdict`              | `text`             | NO   | `—`                                                                                        |
| `reason_code`          | `text`             | NO   | `—`                                                                                        |
| `reviewer_distance_km` | `double precision` | NO   | `—`                                                                                        |
| `gps_accuracy_m`       | `double precision` | YES  | `—`                                                                                        |
| `note`                 | `text`             | YES  | `—`                                                                                        |
| `weight`               | `double precision` | NO   | `1`                                                                                        |
| `rewarded_at`          | `timestamptz`      | YES  | `—`                                                                                        |
| `created_at`           | `timestamptz`      | NO   | `now()`                                                                                    |
| `rating`               | `smallint`         | YES  | `—`                                                                                        |
| `rating_direction`     | `text`             | YES  | `—`                                                                                        |
| `consensus_matched`    | `boolean`          | YES  | `—`                                                                                        |
| `code`                 | `text`             | YES  | `('REV-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `report_id`            | `bigint`           | NO   | `—`                                                                                        |
| `reviewer_id`          | `bigint`           | NO   | `—`                                                                                        |

### reputation_events

ประวัติการเปลี่ยนคะแนน Trust/Reputation.

| คอลัมน์            | Type          | Null | Default / generation                                                                       |
| ------------------ | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `id`               | `bigint`      | NO   | `nextval('reputation_events_id_seq'::regclass)`                                            |
| `legacy_user_id`   | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `legacy_report_id` | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `points`           | `integer`     | NO   | `—`                                                                                        |
| `reason`           | `text`        | NO   | `—`                                                                                        |
| `idempotency_key`  | `text`        | NO   | `—`                                                                                        |
| `created_at`       | `timestamptz` | NO   | `now()`                                                                                    |
| `code`             | `text`        | YES  | `('REP-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `report_id`        | `bigint`      | YES  | `—`                                                                                        |
| `user_id`          | `bigint`      | NO   | `—`                                                                                        |

### stations

สถานีทางการ ใช้รหัสที่ provider กำหนด.

| คอลัมน์       | Type               | Null | Default / generation |
| ------------- | ------------------ | ---- | -------------------- |
| `id`          | `text`             | NO   | `—`                  |
| `name_th`     | `text`             | YES  | `—`                  |
| `name_en`     | `text`             | YES  | `—`                  |
| `lat`         | `double precision` | NO   | `—`                  |
| `lon`         | `double precision` | NO   | `—`                  |
| `province`    | `text`             | YES  | `—`                  |
| `pm25`        | `double precision` | YES  | `—`                  |
| `aqi`         | `integer`          | YES  | `—`                  |
| `color`       | `text`             | YES  | `—`                  |
| `level`       | `text`             | YES  | `—`                  |
| `recorded_at` | `timestamptz`      | YES  | `—`                  |
| `updated_at`  | `timestamptz`      | YES  | `now()`              |
| `district`    | `text`             | YES  | `—`                  |

### sync_runs

ประวัติการ sync Air4Thai.

| คอลัมน์              | Type          | Null | Default / generation                                                                       |
| -------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`          | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `source`             | `text`        | NO   | `—`                                                                                        |
| `status`             | `text`        | NO   | `—`                                                                                        |
| `fetched_count`      | `integer`     | NO   | `0`                                                                                        |
| `station_count`      | `integer`     | NO   | `0`                                                                                        |
| `reading_count`      | `integer`     | NO   | `0`                                                                                        |
| `source_recorded_at` | `timestamptz` | YES  | `—`                                                                                        |
| `error_message`      | `text`        | YES  | `—`                                                                                        |
| `started_at`         | `timestamptz` | NO   | `now()`                                                                                    |
| `completed_at`       | `timestamptz` | YES  | `—`                                                                                        |
| `rejected_count`     | `integer`     | NO   | `0`                                                                                        |
| `rejection_summary`  | `jsonb`       | NO   | `'{}'::jsonb`                                                                              |
| `id`                 | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`               | `text`        | YES  | `('SYN-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |

### user_notifications

กล่องแจ้งเตือนภายในระบบ.

| คอลัมน์             | Type          | Null | Default / generation                                                                       |
| ------------------- | ------------- | ---- | ------------------------------------------------------------------------------------------ |
| `legacy_id`         | `uuid`        | NO   | `gen_random_uuid(); compatibility metadata`                                                |
| `legacy_user_id`    | `uuid`        | YES  | `—; compatibility metadata`                                                                |
| `event_type`        | `text`        | NO   | `—`                                                                                        |
| `title`             | `text`        | NO   | `—`                                                                                        |
| `body`              | `text`        | NO   | `—`                                                                                        |
| `url`               | `text`        | NO   | `'/'::text`                                                                                |
| `entity_type`       | `text`        | YES  | `—`                                                                                        |
| `entity_id`         | `text`        | YES  | `—`                                                                                        |
| `payload`           | `jsonb`       | NO   | `'{}'::jsonb`                                                                              |
| `deduplication_key` | `text`        | NO   | `—`                                                                                        |
| `read_at`           | `timestamptz` | YES  | `—`                                                                                        |
| `created_at`        | `timestamptz` | NO   | `now()`                                                                                    |
| `id`                | `bigint`      | NO   | `IDENTITY (GENERATED ALWAYS)`                                                              |
| `code`              | `text`        | YES  | `('NTF-'::text &#124;&#124; lpad((id)::text, GREATEST(6, length((id)::text)), '0'::text))` |
| `user_id`           | `bigint`      | NO   | `—`                                                                                        |

### weather_observations

ประวัติอากาศที่ผูกสถานีและเวลา.

| คอลัมน์         | Type               | Null | Default / generation |
| --------------- | ------------------ | ---- | -------------------- |
| `station_id`    | `text`             | NO   | `—`                  |
| `recorded_at`   | `timestamptz`      | NO   | `—`                  |
| `temperature`   | `double precision` | YES  | `—`                  |
| `humidity`      | `double precision` | YES  | `—`                  |
| `wind_speed`    | `double precision` | YES  | `—`                  |
| `wind_deg`      | `double precision` | YES  | `—`                  |
| `rain_mm`       | `double precision` | YES  | `—`                  |
| `source_at`     | `timestamptz`      | NO   | `—`                  |
| `ingested_at`   | `timestamptz`      | NO   | `now()`              |
| `source_status` | `text`             | NO   | `'observed'::text`   |
