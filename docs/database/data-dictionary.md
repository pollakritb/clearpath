# Data dictionary — ClearPath

Baseline: `422013d9d31dd25ea69efc1305b1b534d0263afe`, 44 ตาราง public.

**สถานะ:** เอกสารนี้อธิบาย migration ระยะ expand ที่เตรียมใน repository; ยังไม่ใช่หลักฐานว่า production สลับ PK/FK แล้ว. คอลัมน์ `numeric_id`/`code` และ schema `review` จะมีหลัง apply migration เท่านั้น. UUID ยังเป็น PK/FK ที่แอปใช้ระหว่าง expand.

รหัส business entity ใช้ prefix + เลขอย่างน้อย 6 หลัก เช่น `RPT-000001`. Sequence อาจข้ามเลขได้และไม่เริ่มใหม่ทุกปี. รหัสไม่ใช่หลักฐานยืนยันสิทธิ์. Token, signature, hash, idempotency key และรหัส provider คงรูปแบบเดิม.

## ตารางและคีย์

| ตาราง                            | หน้าที่                                                | PK ปัจจุบัน                               | รหัสหลัง expand                                    |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------- | -------------------------------------------------- |
| `activities`                     | กิจกรรมหรือเนื้อหาประกอบชุมชน                          | `(id)`                                    | ACT-000001                                         |
| `alert_events`                   | ประวัติการสร้างเหตุการณ์แจ้งเตือนเพื่อป้องกันการส่งซ้ำ | `(id)`                                    | ALT-000001                                         |
| `announcements`                  | ประกาศของระบบ                                          | `(id)`                                    | ANN-000001                                         |
| `audit_logs`                     | บันทึกตรวจสอบการทำงานย้อนหลัง                          | `(id)`                                    | AUD-000001                                         |
| `cams_grid_active`               | ตัวชี้ generation ของพื้นผิว CAMS ที่กำลังให้บริการ    | `(id)`                                    | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `cams_grid_chunks`               | ข้อมูลชั่วคราวระหว่างเก็บกริดทีละ batch                | `(job_id, batch_index)`                   | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `cams_grid_definitions`          | นิยามแกนพิกัดกริดจากแหล่งข้อมูลภายนอก                  | `(id)`                                    | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `cams_grid_frames`               | ค่าพยากรณ์ของกริดในแต่ละเวลา                           | `(generation_id, valid_at)`               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `cams_grid_generations`          | รอบข้อมูลกริดที่เผยแพร่พร้อมกันเป็นชุด                 | `(id)`                                    | CGN-000001                                         |
| `cams_grid_jobs`                 | งานรวบรวมกริดและสถานะ lease/retry                      | `(id)`                                    | CGJ-000001                                         |
| `capture_sessions`               | หลักฐาน session กล้องที่มีอายุสั้นและใช้ได้ครั้งเดียว  | `(id)`                                    | CAP-000001                                         |
| `community_help_claims`          | การเริ่มช่วยวัดตามคำขอก่อนถ่ายภาพ                      | `(request_id, user_id)`                   | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `community_reports`              | รายงาน PM2.5 พร้อมผลตัดสิน OCR และ Trust               | `(id)`                                    | RPT-000001                                         |
| `community_xp_accounts`          | บัญชี XP และตัวตนสมาชิกสาธารณะแยกจากบัญชีเข้าสู่ระบบ   | `(user_id)`                               | MBR-000001 (ตัวตนสาธารณะ)                          |
| `community_xp_control`           | สวิตช์และ maintenance ของ XP; ไม่ใช่รหัสรายการ         | `(singleton)`                             | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `community_xp_events`            | สมุดรายการ XP แบบเก็บประวัติและ reversal               | `(id)`                                    | XPE-000001                                         |
| `community_xp_jobs`              | คิวคำนวณ XP จากผลตัดสินรายงาน                          | `(report_id)`                             | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `data_issue_reports`             | ปัญหาคุณภาพข้อมูลที่ผู้ใช้แจ้ง                         | `(id)`                                    | ISS-000001                                         |
| `fire_feature_snapshots`         | snapshot satellite hotspot ประกอบการวิเคราะห์สถานี     | `(station_id, recorded_at)`               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `forecast_data_quality_daily`    | สรุปคุณภาพข้อมูลรายวันแยกแหล่งและสถานี                 | `(quality_date, source_name, station_id)` | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `forecast_provider_snapshots`    | หลักฐานพยากรณ์ดิบจาก CAMS แยกสถานีและเวลา              | `(id)`                                    | CFS-000001                                         |
| `forecast_provider_sync_runs`    | ประวัติการรับข้อมูลพยากรณ์จาก provider                 | `(id)`                                    | CPS-000001                                         |
| `line_notification_links`        | การผูกบัญชีกับ LINE และสถานะ consent/การเชื่อมต่อ      | `(user_id)`                               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `line_webhook_events`            | รหัสเหตุการณ์ภายนอกสำหรับป้องกัน webhook ซ้ำ           | `(event_id)`                              | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `measurement_delivery_leases`    | lease การส่งแจ้งเตือนคำขอวัด ป้องกัน worker ส่งชนกัน   | `(event_id)`                              | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `measurement_helper_presence`    | สถานะอาสาช่วยวัดและ GPS ล่าสุดแบบ private              | `(user_id)`                               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `measurement_request_recipients` | รายชื่อผู้ได้รับคำเชิญและสถานะปฏิเสธคำขอ               | `(request_id, user_id)`                   | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `measurement_requests`           | คำขอวัดตามสถานที่ ช่วงเวลา และรัศมี                    | `(id)`                                    | REQ-000001                                         |
| `notification_outbox`            | คิวส่งข้อความพร้อม retry และ deduplication             | `(id)`                                    | OBX-000001                                         |
| `notification_preferences`       | การตั้งค่าและ consent การแจ้งเตือน                     | `(user_id)`                               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `pm25_readings`                  | ประวัติค่าฝุ่นจากสถานีทางการ                           | `(id)`                                    | OBS-000001                                         |
| `profiles`                       | บัญชีภายใน สิทธิ์ และคะแนนความน่าเชื่อถือ              | `(id)`                                    | USR-000001                                         |
| `public_map_events`              | เหตุการณ์สำหรับอัปเดตข้อมูลบนแผนที่                    | `(id)`                                    | MAP-000001                                         |
| `rate_limit_windows`             | จำนวนการเรียก action ในแต่ละช่วงเวลา                   | `(actor_key, action, window_started_at)`  | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `report_comments`                | ความคิดเห็นต่อรายงาน                                   | `(id)`                                    | CMT-000001                                         |
| `report_drafts`                  | ภาพและ OCR ระหว่างเตรียมส่งรายงาน                      | `(id)`                                    | DRF-000001                                         |
| `report_evidence`                | หลักฐาน private แบบหนึ่งต่อหนึ่งกับรายงาน              | `(report_id)`                             | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `report_reactions`               | ปฏิกิริยาต่อรายงาน หนึ่งรายการต่อผู้ใช้                | `(report_id, user_id)`                    | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `report_reviews`                 | คำขอบคุณและดาวพร้อมหลักฐานระยะ GPS                     | `(id)`                                    | REV-000001                                         |
| `reputation_events`              | ประวัติการเปลี่ยนคะแนน Trust/Reputation                | `(id)`                                    | REP-000001                                         |
| `stations`                       | สถานีทางการ ใช้รหัสที่ provider กำหนด                  | `(id)`                                    | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |
| `sync_runs`                      | ประวัติการ sync Air4Thai                               | `(id)`                                    | SYN-000001                                         |
| `user_notifications`             | กล่องแจ้งเตือนภายในระบบ                                | `(id)`                                    | NTF-000001                                         |
| `weather_observations`           | ประวัติอากาศที่ผูกสถานีและเวลา                         | `(station_id, recorded_at)`               | ใช้คีย์ความสัมพันธ์ / natural key / singleton เดิม |

## หลักการอ่านคอลัมน์

- `*_at` เป็นเวลาที่มี timezone ยกเว้นที่ระบุเป็น date; ความหมายเวลารับข้อมูลและเวลาที่ข้อมูลใช้ได้แยกกัน.
- `numeric_id` เป็น identity แบบ GENERATED ALWAYS และ UNIQUE ในระยะ expand; ยังไม่ใช่ PK จนกว่าจะ cutover.
- `*_numeric_id` เป็นตัวเลขของ FK เดิม; trigger รักษาความสอดคล้องจาก UUID. ความสัมพันธ์ historical ที่ปลายทางถูกลบแล้วคงค่า null.
- `code` เป็น generated column; ไม่มี API ให้ผู้ใช้กำหนดเลขเอง. BIGINT ไม่ควรถูกส่งออกเป็น JavaScript number.
- `profiles.auth_user_id` เป็น generated alias ของ UUID เดิมในระยะ expand; คอลัมน์ธรรมดา UNIQUE FK ไป auth.users จะเกิดใน cutover.
- `community_xp_accounts.member_code` มี sequence แยกจาก USR. ห้ามเปิด mapping ระหว่างบัญชี private กับสมาชิกที่ไม่ยินยอมเผยตัวตน.

## คอลัมน์รายตาราง

### activities

กิจกรรมหรือเนื้อหาประกอบชุมชน.

| คอลัมน์               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| --------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                  | `uuid`            | NO                              | `—`                          |
| `title`               | `text`            | NO                              | `—`                          |
| `description`         | `text`            | NO                              | `—`                          |
| `rule_code`           | `text`            | YES                             | `—`                          |
| `target_count`        | `int4`            | YES                             | `—`                          |
| `reward_points`       | `int4`            | NO                              | `0`                          |
| `starts_at`           | `timestamptz`     | YES                             | `—`                          |
| `ends_at`             | `timestamptz`     | YES                             | `—`                          |
| `active`              | `bool`            | NO                              | `true`                       |
| `created_at`          | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand) | `bigint identity` | NO                              | sequence                     |
| `code` (expand)       | `text generated`  | generated จากเลขที่ไม่เป็น null | `ACT-` + เลขอย่างน้อย 6 หลัก |

### alert_events

ประวัติการสร้างเหตุการณ์แจ้งเตือนเพื่อป้องกันการส่งซ้ำ.

| คอลัมน์               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| --------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                  | `uuid`            | NO                              | `—`                          |
| `deduplication_key`   | `text`            | NO                              | `—`                          |
| `source`              | `text`            | NO                              | `—`                          |
| `kind`                | `text`            | NO                              | `—`                          |
| `severity`            | `text`            | NO                              | `—`                          |
| `title`               | `text`            | NO                              | `—`                          |
| `body`                | `text`            | NO                              | `—`                          |
| `district`            | `text`            | YES                             | `—`                          |
| `subdistrict`         | `text`            | YES                             | `—`                          |
| `lat`                 | `float8`          | YES                             | `—`                          |
| `lon`                 | `float8`          | YES                             | `—`                          |
| `detected_at`         | `timestamptz`     | NO                              | `—`                          |
| `sent_at`             | `timestamptz`     | YES                             | `—`                          |
| `recipient_count`     | `int4`            | NO                              | `0`                          |
| `payload`             | `jsonb`           | NO                              | `'{}'::jsonb`                |
| `created_at`          | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand) | `bigint identity` | NO                              | sequence                     |
| `code` (expand)       | `text generated`  | generated จากเลขที่ไม่เป็น null | `ALT-` + เลขอย่างน้อย 6 หลัก |

### announcements

ประกาศของระบบ.

| คอลัมน์                          | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| -------------------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                             | `uuid`            | NO                              | `—`                          |
| `title`                          | `text`            | NO                              | `—`                          |
| `body`                           | `text`            | NO                              | `—`                          |
| `kind`                           | `text`            | NO                              | `'community'::text`          |
| `severity`                       | `text`            | NO                              | `'info'::text`               |
| `area`                           | `text`            | YES                             | `—`                          |
| `district`                       | `text`            | YES                             | `—`                          |
| `subdistrict`                    | `text`            | YES                             | `—`                          |
| `published`                      | `bool`            | NO                              | `false`                      |
| `published_at`                   | `timestamptz`     | NO                              | `now()`                      |
| `expires_at`                     | `timestamptz`     | YES                             | `—`                          |
| `status`                         | `text`            | NO                              | `'published'::text`          |
| `image_path`                     | `text`            | YES                             | `—`                          |
| `created_by`                     | `uuid`            | YES                             | `—`                          |
| `updated_by`                     | `uuid`            | YES                             | `—`                          |
| `created_at`                     | `timestamptz`     | NO                              | `now()`                      |
| `updated_at`                     | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand)            | `bigint identity` | NO                              | sequence                     |
| `code` (expand)                  | `text generated`  | generated จากเลขที่ไม่เป็น null | `ANN-` + เลขอย่างน้อย 6 หลัก |
| `created_by_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`    |
| `updated_by_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`    |

### audit_logs

บันทึกตรวจสอบการทำงานย้อนหลัง.

| คอลัมน์                     | PostgreSQL type  | Null                            | ค่าเริ่มต้น                              |
| --------------------------- | ---------------- | ------------------------------- | ---------------------------------------- |
| `id`                        | `int8`           | NO                              | `nextval('audit_logs_id_seq'::regclass)` |
| `actor_id`                  | `uuid`           | YES                             | `—`                                      |
| `action`                    | `text`           | NO                              | `—`                                      |
| `entity_type`               | `text`           | NO                              | `—`                                      |
| `entity_id`                 | `text`           | YES                             | `—`                                      |
| `details`                   | `jsonb`          | NO                              | `'{}'::jsonb`                            |
| `created_at`                | `timestamptz`    | NO                              | `now()`                                  |
| `code` (expand)             | `text generated` | generated จากเลขที่ไม่เป็น null | `AUD-` + เลขอย่างน้อย 6 หลัก             |
| `actor_numeric_id` (expand) | `bigint`         | YES ระหว่าง expand              | จาก `profiles.numeric_id`                |

### cams_grid_active

ตัวชี้ generation ของพื้นผิว CAMS ที่กำลังให้บริการ.

| คอลัมน์                          | PostgreSQL type | Null               | ค่าเริ่มต้น                            |
| -------------------------------- | --------------- | ------------------ | -------------------------------------- |
| `id`                             | `int4`          | NO                 | `—`                                    |
| `generation_id`                  | `uuid`          | NO                 | `—`                                    |
| `generation_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `cams_grid_generations.numeric_id` |

### cams_grid_chunks

ข้อมูลชั่วคราวระหว่างเก็บกริดทีละ batch.

| คอลัมน์                   | PostgreSQL type | Null               | ค่าเริ่มต้น                     |
| ------------------------- | --------------- | ------------------ | ------------------------------- |
| `job_id`                  | `uuid`          | NO                 | `—`                             |
| `batch_index`             | `int4`          | NO                 | `—`                             |
| `payload`                 | `jsonb`         | NO                 | `—`                             |
| `job_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `cams_grid_jobs.numeric_id` |

### cams_grid_definitions

นิยามแกนพิกัดกริดจากแหล่งข้อมูลภายนอก.

| คอลัมน์      | PostgreSQL type | Null | ค่าเริ่มต้น |
| ------------ | --------------- | ---- | ----------- |
| `id`         | `text`          | NO   | `—`         |
| `latitudes`  | `float8[]`      | NO   | `—`         |
| `longitudes` | `float8[]`      | NO   | `—`         |

### cams_grid_frames

ค่าพยากรณ์ของกริดในแต่ละเวลา.

| คอลัมน์                          | PostgreSQL type | Null               | ค่าเริ่มต้น                            |
| -------------------------------- | --------------- | ------------------ | -------------------------------------- |
| `generation_id`                  | `uuid`          | NO                 | `—`                                    |
| `valid_at`                       | `timestamptz`   | NO                 | `—`                                    |
| `values`                         | `float8[]`      | NO                 | `—`                                    |
| `generation_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `cams_grid_generations.numeric_id` |

### cams_grid_generations

รอบข้อมูลกริดที่เผยแพร่พร้อมกันเป็นชุด.

| คอลัมน์               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| --------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                  | `uuid`            | NO                              | `gen_random_uuid()`                |
| `grid_id`             | `text`            | NO                              | `—`                                |
| `status`              | `text`            | NO                              | `'staging'::text`                  |
| `started_at`          | `timestamptz`     | NO                              | `now()`                            |
| `retrieved_at`        | `timestamptz`     | YES                             | `—`                                |
| `model_issued_at`     | `timestamptz`     | YES                             | `—`                                |
| `valid_times`         | `timestamptz[]`   | NO                              | `'{}'::timestamp with time zone[]` |
| `fingerprint`         | `text`            | YES                             | `—`                                |
| `numeric_id` (expand) | `bigint identity` | NO                              | sequence                           |
| `code` (expand)       | `text generated`  | generated จากเลขที่ไม่เป็น null | `CGN-` + เลขอย่างน้อย 6 หลัก       |

### cams_grid_jobs

งานรวบรวมกริดและสถานะ lease/retry.

| คอลัมน์                          | PostgreSQL type   | Null                            | ค่าเริ่มต้น                            |
| -------------------------------- | ----------------- | ------------------------------- | -------------------------------------- |
| `id`                             | `uuid`            | NO                              | `gen_random_uuid()`                    |
| `slot`                           | `timestamptz`     | NO                              | `—`                                    |
| `generation_id`                  | `uuid`            | YES                             | `—`                                    |
| `status`                         | `text`            | NO                              | `'running'::text`                      |
| `next_batch`                     | `int4`            | NO                              | `0`                                    |
| `batch_count`                    | `int4`            | NO                              | `—`                                    |
| `lease_token`                    | `uuid`            | YES                             | `—`                                    |
| `lease_until`                    | `timestamptz`     | YES                             | `—`                                    |
| `attempts`                       | `int4`            | NO                              | `0`                                    |
| `created_at`                     | `timestamptz`     | NO                              | `now()`                                |
| `completed_at`                   | `timestamptz`     | YES                             | `—`                                    |
| `last_error`                     | `bool`            | NO                              | `false`                                |
| `numeric_id` (expand)            | `bigint identity` | NO                              | sequence                               |
| `code` (expand)                  | `text generated`  | generated จากเลขที่ไม่เป็น null | `CGJ-` + เลขอย่างน้อย 6 หลัก           |
| `generation_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `cams_grid_generations.numeric_id` |

### capture_sessions

หลักฐาน session กล้องที่มีอายุสั้นและใช้ได้ครั้งเดียว.

| คอลัมน์                    | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| -------------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                       | `uuid`            | NO                              | `—`                          |
| `user_id`                  | `uuid`            | NO                              | `—`                          |
| `issued_at`                | `timestamptz`     | NO                              | `—`                          |
| `expires_at`               | `timestamptz`     | NO                              | `—`                          |
| `consumed_at`              | `timestamptz`     | YES                             | `—`                          |
| `created_at`               | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand)      | `bigint identity` | NO                              | sequence                     |
| `code` (expand)            | `text generated`  | generated จากเลขที่ไม่เป็น null | `CAP-` + เลขอย่างน้อย 6 หลัก |
| `user_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`    |

### community_help_claims

การเริ่มช่วยวัดตามคำขอก่อนถ่ายภาพ.

| คอลัมน์                       | PostgreSQL type | Null               | ค่าเริ่มต้น                           |
| ----------------------------- | --------------- | ------------------ | ------------------------------------- |
| `request_id`                  | `uuid`          | NO                 | `—`                                   |
| `user_id`                     | `uuid`          | NO                 | `—`                                   |
| `started_at`                  | `timestamptz`   | NO                 | `now()`                               |
| `request_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `measurement_requests.numeric_id` |
| `user_numeric_id` (expand)    | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id`             |

### community_reports

รายงาน PM2.5 พร้อมผลตัดสิน OCR และ Trust.

| คอลัมน์                                   | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| ----------------------------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                                      | `uuid`            | NO                              | `—`                                |
| `user_id`                                 | `uuid`            | NO                              | `—`                                |
| `display_name`                            | `text`            | YES                             | `—`                                |
| `lat`                                     | `float8`          | NO                              | `—`                                |
| `lon`                                     | `float8`          | NO                              | `—`                                |
| `province`                                | `text`            | NO                              | `'นครปฐม'::text`                   |
| `district`                                | `text`            | YES                             | `—`                                |
| `subdistrict`                             | `text`            | YES                             | `—`                                |
| `pm25`                                    | `float8`          | YES                             | `—`                                |
| `ocr_pm25`                                | `float8`          | YES                             | `—`                                |
| `ocr_confidence`                          | `float8`          | NO                              | `0`                                |
| `ocr_raw_text`                            | `text`            | YES                             | `—`                                |
| `device_detected`                         | `bool`            | NO                              | `false`                            |
| `display_clear`                           | `bool`            | NO                              | `false`                            |
| `capture_source`                          | `text`            | NO                              | `'camera'::text`                   |
| `capture_session_id`                      | `uuid`            | NO                              | `—`                                |
| `image_path`                              | `text`            | YES                             | `—`                                |
| `image_sha256`                            | `text`            | YES                             | `—`                                |
| `image_ahash`                             | `text`            | YES                             | `—`                                |
| `burst_hashes`                            | `jsonb`           | NO                              | `'[]'::jsonb`                      |
| `duplicate_of_report_id`                  | `uuid`            | YES                             | `—`                                |
| `device_model`                            | `text`            | YES                             | `—`                                |
| `device_serial`                           | `text`            | YES                             | `—`                                |
| `device_calibrated`                       | `bool`            | NO                              | `false`                            |
| `calibration_evidence_path`               | `text`            | YES                             | `—`                                |
| `calibrated_at`                           | `date`            | YES                             | `—`                                |
| `averaging_period`                        | `text`            | NO                              | `'instant'::text`                  |
| `measurement_duration_seconds`            | `int4`            | NO                              | `0`                                |
| `measurement_environment`                 | `text`            | NO                              | `'outdoor'::text`                  |
| `measurement_stable`                      | `bool`            | NO                              | `true`                             |
| `near_emission_source`                    | `bool`            | NO                              | `false`                            |
| `measurement_note`                        | `text`            | YES                             | `—`                                |
| `gps_accuracy_m`                          | `float8`          | YES                             | `—`                                |
| `captured_at`                             | `timestamptz`     | NO                              | `—`                                |
| `status`                                  | `text`            | NO                              | `'pending'::text`                  |
| `base_trust_score`                        | `float8`          | NO                              | `0`                                |
| `trust_score`                             | `float8`          | NO                              | `0`                                |
| `trust_reasons`                           | `jsonb`           | NO                              | `'[]'::jsonb`                      |
| `peer_up`                                 | `int4`            | NO                              | `0`                                |
| `peer_down`                               | `int4`            | NO                              | `0`                                |
| `moderated_by`                            | `uuid`            | YES                             | `—`                                |
| `moderation_note`                         | `text`            | YES                             | `—`                                |
| `moderated_at`                            | `timestamptz`     | YES                             | `—`                                |
| `retention_until`                         | `timestamptz`     | YES                             | `—`                                |
| `audit_hold`                              | `bool`            | NO                              | `false`                            |
| `created_at`                              | `timestamptz`     | NO                              | `now()`                            |
| `updated_at`                              | `timestamptz`     | NO                              | `now()`                            |
| `user_claimed_pm25`                       | `float8`          | YES                             | `—`                                |
| `admin_verified_pm25`                     | `float8`          | YES                             | `—`                                |
| `public_lat`                              | `float8`          | YES                             | `—`                                |
| `public_lon`                              | `float8`          | YES                             | `—`                                |
| `camera_session_issued_at`                | `timestamptz`     | YES                             | `—`                                |
| `client_captured_at`                      | `timestamptz`     | YES                             | `—`                                |
| `server_received_at`                      | `timestamptz`     | NO                              | `now()`                            |
| `clock_warning`                           | `bool`            | NO                              | `false`                            |
| `ocr_mismatch`                            | `bool`            | NO                              | `false`                            |
| `rejection_reason_code`                   | `text`            | YES                             | `—`                                |
| `moderation_checks`                       | `jsonb`           | NO                              | `'{}'::jsonb`                      |
| `evidence_purged_at`                      | `timestamptz`     | YES                             | `—`                                |
| `rating_count`                            | `int4`            | NO                              | `0`                                |
| `rating_average`                          | `float8`          | YES                             | `—`                                |
| `policy_version`                          | `text`            | NO                              | `'trust-v1'::text`                 |
| `source_type`                             | `text`            | NO                              | `'individual'::text`               |
| `show_reporter_profile`                   | `bool`            | NO                              | `false`                            |
| `reporter_avatar_url`                     | `text`            | YES                             | `—`                                |
| `like_count`                              | `int4`            | NO                              | `0`                                |
| `dislike_count`                           | `int4`            | NO                              | `0`                                |
| `comment_count`                           | `int4`            | NO                              | `0`                                |
| `image_metadata`                          | `jsonb`           | NO                              | `'{}'::jsonb`                      |
| `numeric_id` (expand)                     | `bigint identity` | NO                              | sequence                           |
| `code` (expand)                           | `text generated`  | generated จากเลขที่ไม่เป็น null | `RPT-` + เลขอย่างน้อย 6 หลัก       |
| `capture_session_numeric_id` (expand)     | `bigint`          | YES ระหว่าง expand              | จาก `capture_sessions.numeric_id`  |
| `duplicate_of_report_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id` |
| `moderated_by_numeric_id` (expand)        | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |
| `user_numeric_id` (expand)                | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |

### community_xp_accounts

บัญชี XP และตัวตนสมาชิกสาธารณะแยกจากบัญชีเข้าสู่ระบบ.

| คอลัมน์                      | PostgreSQL type   | Null               | ค่าเริ่มต้น                                                                                                      |
| ---------------------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `user_id`                    | `uuid`            | NO                 | `—`                                                                                                              |
| `member_id`                  | `uuid`            | NO                 | `gen_random_uuid()`                                                                                              |
| `alias`                      | `text`            | NO                 | `('สมาชิก CP-'::text &#124;&#124; upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8)))` |
| `hidden`                     | `bool`            | NO                 | `false`                                                                                                          |
| `created_at`                 | `timestamptz`     | NO                 | `now()`                                                                                                          |
| `member_numeric_id` (expand) | `bigint identity` | NO                 | sequence แยก                                                                                                     |
| `member_code` (expand)       | `text generated`  | generated          | `MBR-` + เลขอย่างน้อย 6 หลัก                                                                                     |
| `user_numeric_id` (expand)   | `bigint`          | YES ระหว่าง expand | จาก `profiles.numeric_id`                                                                                        |

### community_xp_control

สวิตช์และ maintenance ของ XP; ไม่ใช่รหัสรายการ.

| คอลัมน์          | PostgreSQL type | Null | ค่าเริ่มต้น         |
| ---------------- | --------------- | ---- | ------------------- |
| `singleton`      | `bool`          | NO   | `true`              |
| `enabled`        | `bool`          | NO   | `false`             |
| `maintenance`    | `bool`          | NO   | `false`             |
| `reset_version`  | `uuid`          | NO   | `gen_random_uuid()` |
| `reset_manifest` | `text`          | YES  | `—`                 |

### community_xp_events

สมุดรายการ XP แบบเก็บประวัติและ reversal.

| คอลัมน์                         | PostgreSQL type   | Null                            | ค่าเริ่มต้น                           |
| ------------------------------- | ----------------- | ------------------------------- | ------------------------------------- |
| `id`                            | `uuid`            | NO                              | `gen_random_uuid()`                   |
| `user_id`                       | `uuid`            | NO                              | `—`                                   |
| `report_id`                     | `uuid`            | YES                             | `—`                                   |
| `request_id`                    | `uuid`            | YES                             | `—`                                   |
| `requester_id`                  | `uuid`            | YES                             | `—`                                   |
| `kind`                          | `text`            | NO                              | `—`                                   |
| `points`                        | `int4`            | NO                              | `—`                                   |
| `reason`                        | `text`            | NO                              | `—`                                   |
| `occurred_at`                   | `timestamptz`     | NO                              | `—`                                   |
| `recorded_at`                   | `timestamptz`     | NO                              | `now()`                               |
| `policy_version`                | `text`            | NO                              | `'xp-v1'::text`                       |
| `reverses`                      | `uuid`            | YES                             | `—`                                   |
| `numeric_id` (expand)           | `bigint identity` | NO                              | sequence                              |
| `code` (expand)                 | `text generated`  | generated จากเลขที่ไม่เป็น null | `XPE-` + เลขอย่างน้อย 6 หลัก          |
| `report_numeric_id` (expand)    | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id`    |
| `request_numeric_id` (expand)   | `bigint`          | YES ระหว่าง expand              | จาก `measurement_requests.numeric_id` |
| `requester_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`             |
| `reverses_numeric_id` (expand)  | `bigint`          | YES ระหว่าง expand              | จาก `community_xp_events.numeric_id`  |
| `user_numeric_id` (expand)      | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`             |

### community_xp_jobs

คิวคำนวณ XP จากผลตัดสินรายงาน.

| คอลัมน์                      | PostgreSQL type | Null               | ค่าเริ่มต้น                        |
| ---------------------------- | --------------- | ------------------ | ---------------------------------- |
| `report_id`                  | `uuid`          | NO                 | `—`                                |
| `user_id`                    | `uuid`          | NO                 | `—`                                |
| `occurred_at`                | `timestamptz`   | NO                 | `—`                                |
| `report_snapshot`            | `jsonb`         | NO                 | `—`                                |
| `evidence_snapshot`          | `jsonb`         | NO                 | `—`                                |
| `state`                      | `text`          | NO                 | `'pending'::text`                  |
| `processed_at`               | `timestamptz`   | YES                | `—`                                |
| `report_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `community_reports.numeric_id` |
| `user_numeric_id` (expand)   | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id`          |

### data_issue_reports

ปัญหาคุณภาพข้อมูลที่ผู้ใช้แจ้ง.

| คอลัมน์                    | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| -------------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                       | `uuid`            | NO                              | `—`                          |
| `user_id`                  | `uuid`            | NO                              | `—`                          |
| `category`                 | `text`            | NO                              | `—`                          |
| `reference_id`             | `text`            | YES                             | `—`                          |
| `message`                  | `text`            | NO                              | `—`                          |
| `status`                   | `text`            | NO                              | `'new'::text`                |
| `created_at`               | `timestamptz`     | NO                              | `now()`                      |
| `updated_at`               | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand)      | `bigint identity` | NO                              | sequence                     |
| `code` (expand)            | `text generated`  | generated จากเลขที่ไม่เป็น null | `ISS-` + เลขอย่างน้อย 6 หลัก |
| `user_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`    |

### fire_feature_snapshots

snapshot satellite hotspot ประกอบการวิเคราะห์สถานี.

| คอลัมน์                | PostgreSQL type | Null | ค่าเริ่มต้น        |
| ---------------------- | --------------- | ---- | ------------------ |
| `station_id`           | `text`          | NO   | `—`                |
| `recorded_at`          | `timestamptz`   | NO   | `—`                |
| `hotspot_count`        | `int4`          | NO   | `0`                |
| `weighted_frp`         | `float8`        | NO   | `0`                |
| `upwind_hotspot_count` | `int4`          | NO   | `0`                |
| `source_at`            | `timestamptz`   | NO   | `—`                |
| `ingested_at`          | `timestamptz`   | NO   | `now()`            |
| `source_status`        | `text`          | NO   | `'observed'::text` |

### forecast_data_quality_daily

สรุปคุณภาพข้อมูลรายวันแยกแหล่งและสถานี.

| คอลัมน์            | PostgreSQL type | Null | ค่าเริ่มต้น   |
| ------------------ | --------------- | ---- | ------------- |
| `quality_date`     | `date`          | NO   | `—`           |
| `source_name`      | `text`          | NO   | `—`           |
| `station_id`       | `text`          | NO   | `—`           |
| `expected_hours`   | `int4`          | NO   | `—`           |
| `observed_hours`   | `int4`          | NO   | `—`           |
| `missing_hours`    | `int4`          | NO   | `—`           |
| `duplicate_hours`  | `int4`          | NO   | `—`           |
| `invalid_rows`     | `int4`          | NO   | `—`           |
| `newest_source_at` | `timestamptz`   | YES  | `—`           |
| `details`          | `jsonb`         | NO   | `'{}'::jsonb` |
| `reconciled_at`    | `timestamptz`   | NO   | `now()`       |

### forecast_provider_snapshots

หลักฐานพยากรณ์ดิบจาก CAMS แยกสถานีและเวลา.

| คอลัมน์                        | PostgreSQL type   | Null                            | ค่าเริ่มต้น                                  |
| ------------------------------ | ----------------- | ------------------------------- | -------------------------------------------- |
| `id`                           | `uuid`            | NO                              | `gen_random_uuid()`                          |
| `sync_run_id`                  | `uuid`            | YES                             | `—`                                          |
| `station_id`                   | `text`            | NO                              | `—`                                          |
| `provider`                     | `text`            | NO                              | `—`                                          |
| `issued_at`                    | `timestamptz`     | NO                              | `—`                                          |
| `forecast_at`                  | `timestamptz`     | NO                              | `—`                                          |
| `horizon_hours`                | `int4`            | NO                              | `—`                                          |
| `pm25`                         | `float8`          | NO                              | `—`                                          |
| `unit`                         | `text`            | NO                              | `'µg/m³'::text`                              |
| `raw_metadata`                 | `jsonb`           | NO                              | `'{}'::jsonb`                                |
| `created_at`                   | `timestamptz`     | NO                              | `now()`                                      |
| `numeric_id` (expand)          | `bigint identity` | NO                              | sequence                                     |
| `code` (expand)                | `text generated`  | generated จากเลขที่ไม่เป็น null | `CFS-` + เลขอย่างน้อย 6 หลัก                 |
| `sync_run_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `forecast_provider_sync_runs.numeric_id` |

### forecast_provider_sync_runs

ประวัติการรับข้อมูลพยากรณ์จาก provider.

| คอลัมน์               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| --------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                  | `uuid`            | NO                              | `gen_random_uuid()`          |
| `provider`            | `text`            | NO                              | `—`                          |
| `status`              | `text`            | NO                              | `—`                          |
| `station_count`       | `int4`            | NO                              | `0`                          |
| `snapshot_count`      | `int4`            | NO                              | `0`                          |
| `error_count`         | `int4`            | NO                              | `0`                          |
| `error_message`       | `text`            | YES                             | `—`                          |
| `started_at`          | `timestamptz`     | NO                              | `now()`                      |
| `completed_at`        | `timestamptz`     | YES                             | `—`                          |
| `metadata`            | `jsonb`           | NO                              | `'{}'::jsonb`                |
| `numeric_id` (expand) | `bigint identity` | NO                              | sequence                     |
| `code` (expand)       | `text generated`  | generated จากเลขที่ไม่เป็น null | `CPS-` + เลขอย่างน้อย 6 หลัก |

### line_notification_links

การผูกบัญชีกับ LINE และสถานะ consent/การเชื่อมต่อ.

| คอลัมน์                    | PostgreSQL type | Null               | ค่าเริ่มต้น               |
| -------------------------- | --------------- | ------------------ | ------------------------- |
| `user_id`                  | `uuid`          | NO                 | `—`                       |
| `line_user_id`             | `text`          | YES                | `—`                       |
| `link_code_hash`           | `text`          | YES                | `—`                       |
| `link_code_expires_at`     | `timestamptz`   | YES                | `—`                       |
| `active`                   | `bool`          | NO                 | `false`                   |
| `linked_at`                | `timestamptz`   | YES                | `—`                       |
| `created_at`               | `timestamptz`   | NO                 | `now()`                   |
| `updated_at`               | `timestamptz`   | NO                 | `now()`                   |
| `user_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id` |

### line_webhook_events

รหัสเหตุการณ์ภายนอกสำหรับป้องกัน webhook ซ้ำ.

| คอลัมน์        | PostgreSQL type | Null | ค่าเริ่มต้น                    |
| -------------- | --------------- | ---- | ------------------------------ |
| `event_id`     | `text`          | NO   | `—`                            |
| `processed_at` | `timestamptz`   | NO   | `now()`                        |
| `expires_at`   | `timestamptz`   | NO   | `(now() + '7 days'::interval)` |

### measurement_delivery_leases

lease การส่งแจ้งเตือนคำขอวัด ป้องกัน worker ส่งชนกัน.

| คอลัมน์                     | PostgreSQL type | Null               | ค่าเริ่มต้น                          |
| --------------------------- | --------------- | ------------------ | ------------------------------------ |
| `event_id`                  | `uuid`          | NO                 | `—`                                  |
| `lease_until`               | `timestamptz`   | NO                 | `—`                                  |
| `event_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `notification_outbox.numeric_id` |

### measurement_helper_presence

สถานะอาสาช่วยวัดและ GPS ล่าสุดแบบ private.

| คอลัมน์                    | PostgreSQL type | Null               | ค่าเริ่มต้น               |
| -------------------------- | --------------- | ------------------ | ------------------------- |
| `user_id`                  | `uuid`          | NO                 | `—`                       |
| `enabled`                  | `bool`          | NO                 | `false`                   |
| `lat`                      | `float8`        | YES                | `—`                       |
| `lon`                      | `float8`        | YES                | `—`                       |
| `accuracy_m`               | `float8`        | YES                | `—`                       |
| `observed_at`              | `timestamptz`   | YES                | `—`                       |
| `updated_at`               | `timestamptz`   | NO                 | `now()`                   |
| `user_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id` |

### measurement_request_recipients

รายชื่อผู้ได้รับคำเชิญและสถานะปฏิเสธคำขอ.

| คอลัมน์                       | PostgreSQL type | Null               | ค่าเริ่มต้น                           |
| ----------------------------- | --------------- | ------------------ | ------------------------------------- |
| `request_id`                  | `uuid`          | NO                 | `—`                                   |
| `user_id`                     | `uuid`          | NO                 | `—`                                   |
| `matched_location_at`         | `timestamptz`   | NO                 | `—`                                   |
| `declined`                    | `bool`          | NO                 | `false`                               |
| `created_at`                  | `timestamptz`   | NO                 | `now()`                               |
| `request_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `measurement_requests.numeric_id` |
| `user_numeric_id` (expand)    | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id`             |

### measurement_requests

คำขอวัดตามสถานที่ ช่วงเวลา และรัศมี.

| คอลัมน์                               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| ------------------------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                                  | `uuid`            | NO                              | `—`                                |
| `user_id`                             | `uuid`            | NO                              | `—`                                |
| `idempotency_key`                     | `uuid`            | NO                              | `—`                                |
| `fingerprint`                         | `text`            | NO                              | `—`                                |
| `place_name`                          | `text`            | NO                              | `—`                                |
| `lat`                                 | `float8`          | NO                              | `—`                                |
| `lon`                                 | `float8`          | NO                              | `—`                                |
| `radius_km`                           | `int4`            | NO                              | `—`                                |
| `starts_at`                           | `timestamptz`     | NO                              | `—`                                |
| `expires_at`                          | `timestamptz`     | NO                              | `—`                                |
| `dispatch_cursor`                     | `uuid`            | YES                             | `—`                                |
| `last_processed_at`                   | `timestamptz`     | YES                             | `—`                                |
| `status`                              | `text`            | NO                              | `—`                                |
| `result_report_id`                    | `uuid`            | YES                             | `—`                                |
| `created_at`                          | `timestamptz`     | NO                              | `now()`                            |
| `updated_at`                          | `timestamptz`     | NO                              | `now()`                            |
| `numeric_id` (expand)                 | `bigint identity` | NO                              | sequence                           |
| `code` (expand)                       | `text generated`  | generated จากเลขที่ไม่เป็น null | `REQ-` + เลขอย่างน้อย 6 หลัก       |
| `dispatch_cursor_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |
| `result_report_numeric_id` (expand)   | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id` |
| `user_numeric_id` (expand)            | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |

### notification_outbox

คิวส่งข้อความพร้อม retry และ deduplication.

| คอลัมน์                            | PostgreSQL type   | Null                            | ค่าเริ่มต้น                         |
| ---------------------------------- | ----------------- | ------------------------------- | ----------------------------------- |
| `id`                               | `uuid`            | NO                              | `—`                                 |
| `user_id`                          | `uuid`            | NO                              | `—`                                 |
| `notification_id`                  | `uuid`            | YES                             | `—`                                 |
| `event_key`                        | `text`            | NO                              | `—`                                 |
| `payload`                          | `jsonb`           | NO                              | `—`                                 |
| `status`                           | `text`            | NO                              | `'pending'::text`                   |
| `attempts`                         | `int4`            | NO                              | `0`                                 |
| `next_attempt_at`                  | `timestamptz`     | NO                              | `now()`                             |
| `last_error`                       | `text`            | YES                             | `—`                                 |
| `processed_at`                     | `timestamptz`     | YES                             | `—`                                 |
| `created_at`                       | `timestamptz`     | NO                              | `now()`                             |
| `updated_at`                       | `timestamptz`     | NO                              | `now()`                             |
| `numeric_id` (expand)              | `bigint identity` | NO                              | sequence                            |
| `code` (expand)                    | `text generated`  | generated จากเลขที่ไม่เป็น null | `OBX-` + เลขอย่างน้อย 6 หลัก        |
| `notification_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `user_notifications.numeric_id` |
| `user_numeric_id` (expand)         | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`           |

### notification_preferences

การตั้งค่าและ consent การแจ้งเตือน.

| คอลัมน์                    | PostgreSQL type | Null               | ค่าเริ่มต้น               |
| -------------------------- | --------------- | ------------------ | ------------------------- |
| `user_id`                  | `uuid`          | NO                 | `—`                       |
| `district`                 | `text`          | YES                | `—`                       |
| `subdistrict`              | `text`          | YES                | `—`                       |
| `radius_km`                | `float8`        | YES                | `—`                       |
| `center_lat`               | `float8`        | YES                | `—`                       |
| `center_lon`               | `float8`        | YES                | `—`                       |
| `pm25_threshold`           | `float8`        | NO                 | `37.5`                    |
| `air_alerts`               | `bool`          | NO                 | `true`                    |
| `hotspot_alerts`           | `bool`          | NO                 | `true`                    |
| `community_alerts`         | `bool`          | NO                 | `false`                   |
| `updated_at`               | `timestamptz`   | NO                 | `now()`                   |
| `report_status_alerts`     | `bool`          | NO                 | `true`                    |
| `rating_alerts`            | `bool`          | NO                 | `true`                    |
| `reward_alerts`            | `bool`          | NO                 | `true`                    |
| `leaderboard_alerts`       | `bool`          | NO                 | `false`                   |
| `announcement_alerts`      | `bool`          | NO                 | `true`                    |
| `line_enabled`             | `bool`          | NO                 | `true`                    |
| `web_push_enabled`         | `bool`          | NO                 | `true`                    |
| `quiet_hours_start`        | `text`          | YES                | `'22:00'::text`           |
| `quiet_hours_end`          | `text`          | YES                | `'07:00'::text`           |
| `timezone`                 | `text`          | NO                 | `'Asia/Bangkok'::text`    |
| `consent_granted`          | `bool`          | NO                 | `false`                   |
| `consent_granted_at`       | `timestamptz`   | YES                | `—`                       |
| `user_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id` |

### pm25_readings

ประวัติค่าฝุ่นจากสถานีทางการ.

| คอลัมน์         | PostgreSQL type  | Null                            | ค่าเริ่มต้น                                 |
| --------------- | ---------------- | ------------------------------- | ------------------------------------------- |
| `id`            | `int8`           | NO                              | `nextval('pm25_readings_id_seq'::regclass)` |
| `station_id`    | `text`           | YES                             | `—`                                         |
| `pm25`          | `float8`         | YES                             | `—`                                         |
| `aqi`           | `int4`           | YES                             | `—`                                         |
| `recorded_at`   | `timestamptz`    | NO                              | `—`                                         |
| `created_at`    | `timestamptz`    | YES                             | `now()`                                     |
| `source_at`     | `timestamptz`    | NO                              | `—`                                         |
| `ingested_at`   | `timestamptz`    | NO                              | `now()`                                     |
| `source_status` | `text`           | NO                              | `'observed'::text`                          |
| `code` (expand) | `text generated` | generated จากเลขที่ไม่เป็น null | `OBS-` + เลขอย่างน้อย 6 หลัก                |

### profiles

บัญชีภายใน สิทธิ์ และคะแนนความน่าเชื่อถือ.

| คอลัมน์                 | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| ----------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                    | `uuid`            | NO                              | `—`                          |
| `display_name`          | `text`            | YES                             | `—`                          |
| `role`                  | `text`            | NO                              | `'user'::text`               |
| `reputation_score`      | `int4`            | NO                              | `0`                          |
| `approved_reports`      | `int4`            | NO                              | `0`                          |
| `helpful_reviews`       | `int4`            | NO                              | `0`                          |
| `created_at`            | `timestamptz`     | NO                              | `now()`                      |
| `updated_at`            | `timestamptz`     | NO                              | `now()`                      |
| `avatar_url`            | `text`            | YES                             | `—`                          |
| `identity_provider`     | `text`            | YES                             | `—`                          |
| `numeric_id` (expand)   | `bigint identity` | NO                              | sequence                     |
| `code` (expand)         | `text generated`  | generated จากเลขที่ไม่เป็น null | `USR-` + เลขอย่างน้อย 6 หลัก |
| `auth_user_id` (expand) | `uuid generated`  | เท่ากับ id                      | auth linkage เดิม            |

### public_map_events

เหตุการณ์สำหรับอัปเดตข้อมูลบนแผนที่.

| คอลัมน์                      | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| ---------------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                         | `uuid`            | NO                              | `—`                                |
| `event_type`                 | `text`            | NO                              | `—`                                |
| `entity_id`                  | `uuid`            | NO                              | `—`                                |
| `created_at`                 | `timestamptz`     | NO                              | `now()`                            |
| `numeric_id` (expand)        | `bigint identity` | NO                              | sequence                           |
| `code` (expand)              | `text generated`  | generated จากเลขที่ไม่เป็น null | `MAP-` + เลขอย่างน้อย 6 หลัก       |
| `entity_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id` |

### rate_limit_windows

จำนวนการเรียก action ในแต่ละช่วงเวลา.

| คอลัมน์             | PostgreSQL type | Null | ค่าเริ่มต้น |
| ------------------- | --------------- | ---- | ----------- |
| `actor_key`         | `text`          | NO   | `—`         |
| `action`            | `text`          | NO   | `—`         |
| `window_started_at` | `timestamptz`   | NO   | `—`         |
| `request_count`     | `int4`          | NO   | `0`         |

### report_comments

ความคิดเห็นต่อรายงาน.

| คอลัมน์                      | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| ---------------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                         | `uuid`            | NO                              | `—`                                |
| `report_id`                  | `uuid`            | NO                              | `—`                                |
| `user_id`                    | `uuid`            | NO                              | `—`                                |
| `body`                       | `text`            | NO                              | `—`                                |
| `status`                     | `text`            | NO                              | `'published'::text`                |
| `created_at`                 | `timestamptz`     | NO                              | `now()`                            |
| `updated_at`                 | `timestamptz`     | NO                              | `now()`                            |
| `numeric_id` (expand)        | `bigint identity` | NO                              | sequence                           |
| `code` (expand)              | `text generated`  | generated จากเลขที่ไม่เป็น null | `CMT-` + เลขอย่างน้อย 6 หลัก       |
| `report_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id` |
| `user_numeric_id` (expand)   | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |

### report_drafts

ภาพและ OCR ระหว่างเตรียมส่งรายงาน.

| คอลัมน์                                   | PostgreSQL type   | Null                            | ค่าเริ่มต้น                        |
| ----------------------------------------- | ----------------- | ------------------------------- | ---------------------------------- |
| `id`                                      | `uuid`            | NO                              | `—`                                |
| `user_id`                                 | `uuid`            | NO                              | `—`                                |
| `capture_session_id`                      | `uuid`            | NO                              | `—`                                |
| `exact_lat`                               | `float8`          | NO                              | `—`                                |
| `exact_lon`                               | `float8`          | NO                              | `—`                                |
| `gps_accuracy_m`                          | `float8`          | YES                             | `—`                                |
| `camera_session_issued_at`                | `timestamptz`     | NO                              | `—`                                |
| `client_captured_at`                      | `timestamptz`     | NO                              | `—`                                |
| `effective_captured_at`                   | `timestamptz`     | NO                              | `—`                                |
| `server_received_at`                      | `timestamptz`     | NO                              | `now()`                            |
| `clock_warning`                           | `bool`            | NO                              | `false`                            |
| `image_path`                              | `text`            | NO                              | `—`                                |
| `image_sha256`                            | `text`            | NO                              | `—`                                |
| `image_ahash`                             | `text`            | YES                             | `—`                                |
| `burst_hashes`                            | `jsonb`           | NO                              | `'[]'::jsonb`                      |
| `duplicate_of_report_id`                  | `uuid`            | YES                             | `—`                                |
| `ocr_pm25`                                | `float8`          | YES                             | `—`                                |
| `ocr_confidence`                          | `float8`          | NO                              | `0`                                |
| `ocr_raw_text`                            | `text`            | YES                             | `—`                                |
| `device_detected`                         | `bool`            | NO                              | `false`                            |
| `display_clear`                           | `bool`            | NO                              | `false`                            |
| `expires_at`                              | `timestamptz`     | NO                              | `—`                                |
| `submitted_at`                            | `timestamptz`     | YES                             | `—`                                |
| `created_at`                              | `timestamptz`     | NO                              | `now()`                            |
| `ocr_status`                              | `text`            | NO                              | `'unavailable'::text`              |
| `unexpected_exif`                         | `bool`            | NO                              | `false`                            |
| `capture_source`                          | `text`            | NO                              | `'camera'::text`                   |
| `image_metadata`                          | `jsonb`           | NO                              | `'{}'::jsonb`                      |
| `original_image_path`                     | `text`            | YES                             | `—`                                |
| `numeric_id` (expand)                     | `bigint identity` | NO                              | sequence                           |
| `code` (expand)                           | `text generated`  | generated จากเลขที่ไม่เป็น null | `DRF-` + เลขอย่างน้อย 6 หลัก       |
| `capture_session_numeric_id` (expand)     | `bigint`          | YES ระหว่าง expand              | จาก `capture_sessions.numeric_id`  |
| `duplicate_of_report_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `community_reports.numeric_id` |
| `user_numeric_id` (expand)                | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`          |

### report_evidence

หลักฐาน private แบบหนึ่งต่อหนึ่งกับรายงาน.

| คอลัมน์                               | PostgreSQL type | Null               | ค่าเริ่มต้น                        |
| ------------------------------------- | --------------- | ------------------ | ---------------------------------- |
| `report_id`                           | `uuid`          | NO                 | `—`                                |
| `exact_lat`                           | `float8`        | YES                | `—`                                |
| `exact_lon`                           | `float8`        | YES                | `—`                                |
| `gps_accuracy_m`                      | `float8`        | YES                | `—`                                |
| `capture_session_id`                  | `uuid`          | YES                | `—`                                |
| `camera_session_issued_at`            | `timestamptz`   | YES                | `—`                                |
| `client_captured_at`                  | `timestamptz`   | YES                | `—`                                |
| `server_received_at`                  | `timestamptz`   | NO                 | `now()`                            |
| `image_path`                          | `text`          | YES                | `—`                                |
| `image_sha256`                        | `text`          | YES                | `—`                                |
| `image_ahash`                         | `text`          | YES                | `—`                                |
| `burst_hashes`                        | `jsonb`         | NO                 | `'[]'::jsonb`                      |
| `ocr_raw_text`                        | `text`          | YES                | `—`                                |
| `retention_until`                     | `timestamptz`   | YES                | `—`                                |
| `purged_at`                           | `timestamptz`   | YES                | `—`                                |
| `audit_hold`                          | `bool`          | NO                 | `false`                            |
| `created_at`                          | `timestamptz`   | NO                 | `now()`                            |
| `ocr_status`                          | `text`          | NO                 | `'unavailable'::text`              |
| `unexpected_exif`                     | `bool`          | NO                 | `false`                            |
| `image_metadata`                      | `jsonb`         | NO                 | `'{}'::jsonb`                      |
| `original_image_path`                 | `text`          | YES                | `—`                                |
| `capture_session_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `capture_sessions.numeric_id`  |
| `report_numeric_id` (expand)          | `bigint`        | YES ระหว่าง expand | จาก `community_reports.numeric_id` |

### report_reactions

ปฏิกิริยาต่อรายงาน หนึ่งรายการต่อผู้ใช้.

| คอลัมน์                      | PostgreSQL type | Null               | ค่าเริ่มต้น                        |
| ---------------------------- | --------------- | ------------------ | ---------------------------------- |
| `report_id`                  | `uuid`          | NO                 | `—`                                |
| `user_id`                    | `uuid`          | NO                 | `—`                                |
| `reaction`                   | `text`          | NO                 | `—`                                |
| `created_at`                 | `timestamptz`   | NO                 | `now()`                            |
| `updated_at`                 | `timestamptz`   | NO                 | `now()`                            |
| `report_numeric_id` (expand) | `bigint`        | YES ระหว่าง expand | จาก `community_reports.numeric_id` |
| `user_numeric_id` (expand)   | `bigint`        | YES ระหว่าง expand | จาก `profiles.numeric_id`          |

### report_reviews

คำขอบคุณและดาวพร้อมหลักฐานระยะ GPS.

| คอลัมน์                        | PostgreSQL type  | Null                            | ค่าเริ่มต้น                                  |
| ------------------------------ | ---------------- | ------------------------------- | -------------------------------------------- |
| `id`                           | `int8`           | NO                              | `nextval('report_reviews_id_seq'::regclass)` |
| `report_id`                    | `uuid`           | NO                              | `—`                                          |
| `reviewer_id`                  | `uuid`           | NO                              | `—`                                          |
| `verdict`                      | `text`           | NO                              | `—`                                          |
| `reason_code`                  | `text`           | NO                              | `—`                                          |
| `reviewer_distance_km`         | `float8`         | NO                              | `—`                                          |
| `gps_accuracy_m`               | `float8`         | YES                             | `—`                                          |
| `note`                         | `text`           | YES                             | `—`                                          |
| `weight`                       | `float8`         | NO                              | `1`                                          |
| `rewarded_at`                  | `timestamptz`    | YES                             | `—`                                          |
| `created_at`                   | `timestamptz`    | NO                              | `now()`                                      |
| `rating`                       | `int2`           | YES                             | `—`                                          |
| `rating_direction`             | `text`           | YES                             | `—`                                          |
| `consensus_matched`            | `bool`           | YES                             | `—`                                          |
| `code` (expand)                | `text generated` | generated จากเลขที่ไม่เป็น null | `REV-` + เลขอย่างน้อย 6 หลัก                 |
| `report_numeric_id` (expand)   | `bigint`         | YES ระหว่าง expand              | จาก `community_reports.numeric_id`           |
| `reviewer_numeric_id` (expand) | `bigint`         | YES ระหว่าง expand              | จาก `profiles.numeric_id`                    |

### reputation_events

ประวัติการเปลี่ยนคะแนน Trust/Reputation.

| คอลัมน์                      | PostgreSQL type  | Null                            | ค่าเริ่มต้น                                     |
| ---------------------------- | ---------------- | ------------------------------- | ----------------------------------------------- |
| `id`                         | `int8`           | NO                              | `nextval('reputation_events_id_seq'::regclass)` |
| `user_id`                    | `uuid`           | NO                              | `—`                                             |
| `report_id`                  | `uuid`           | YES                             | `—`                                             |
| `points`                     | `int4`           | NO                              | `—`                                             |
| `reason`                     | `text`           | NO                              | `—`                                             |
| `idempotency_key`            | `text`           | NO                              | `—`                                             |
| `created_at`                 | `timestamptz`    | NO                              | `now()`                                         |
| `code` (expand)              | `text generated` | generated จากเลขที่ไม่เป็น null | `REP-` + เลขอย่างน้อย 6 หลัก                    |
| `report_numeric_id` (expand) | `bigint`         | YES ระหว่าง expand              | จาก `community_reports.numeric_id`              |
| `user_numeric_id` (expand)   | `bigint`         | YES ระหว่าง expand              | จาก `profiles.numeric_id`                       |

### stations

สถานีทางการ ใช้รหัสที่ provider กำหนด.

| คอลัมน์       | PostgreSQL type | Null | ค่าเริ่มต้น |
| ------------- | --------------- | ---- | ----------- |
| `id`          | `text`          | NO   | `—`         |
| `name_th`     | `text`          | YES  | `—`         |
| `name_en`     | `text`          | YES  | `—`         |
| `lat`         | `float8`        | NO   | `—`         |
| `lon`         | `float8`        | NO   | `—`         |
| `province`    | `text`          | YES  | `—`         |
| `pm25`        | `float8`        | YES  | `—`         |
| `aqi`         | `int4`          | YES  | `—`         |
| `color`       | `text`          | YES  | `—`         |
| `level`       | `text`          | YES  | `—`         |
| `recorded_at` | `timestamptz`   | YES  | `—`         |
| `updated_at`  | `timestamptz`   | YES  | `now()`     |
| `district`    | `text`          | YES  | `—`         |

### sync_runs

ประวัติการ sync Air4Thai.

| คอลัมน์               | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| --------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                  | `uuid`            | NO                              | `—`                          |
| `source`              | `text`            | NO                              | `—`                          |
| `status`              | `text`            | NO                              | `—`                          |
| `fetched_count`       | `int4`            | NO                              | `0`                          |
| `station_count`       | `int4`            | NO                              | `0`                          |
| `reading_count`       | `int4`            | NO                              | `0`                          |
| `source_recorded_at`  | `timestamptz`     | YES                             | `—`                          |
| `error_message`       | `text`            | YES                             | `—`                          |
| `started_at`          | `timestamptz`     | NO                              | `now()`                      |
| `completed_at`        | `timestamptz`     | YES                             | `—`                          |
| `rejected_count`      | `int4`            | NO                              | `0`                          |
| `rejection_summary`   | `jsonb`           | NO                              | `'{}'::jsonb`                |
| `numeric_id` (expand) | `bigint identity` | NO                              | sequence                     |
| `code` (expand)       | `text generated`  | generated จากเลขที่ไม่เป็น null | `SYN-` + เลขอย่างน้อย 6 หลัก |

### user_notifications

กล่องแจ้งเตือนภายในระบบ.

| คอลัมน์                    | PostgreSQL type   | Null                            | ค่าเริ่มต้น                  |
| -------------------------- | ----------------- | ------------------------------- | ---------------------------- |
| `id`                       | `uuid`            | NO                              | `—`                          |
| `user_id`                  | `uuid`            | NO                              | `—`                          |
| `event_type`               | `text`            | NO                              | `—`                          |
| `title`                    | `text`            | NO                              | `—`                          |
| `body`                     | `text`            | NO                              | `—`                          |
| `url`                      | `text`            | NO                              | `'/'::text`                  |
| `entity_type`              | `text`            | YES                             | `—`                          |
| `entity_id`                | `text`            | YES                             | `—`                          |
| `payload`                  | `jsonb`           | NO                              | `'{}'::jsonb`                |
| `deduplication_key`        | `text`            | NO                              | `—`                          |
| `read_at`                  | `timestamptz`     | YES                             | `—`                          |
| `created_at`               | `timestamptz`     | NO                              | `now()`                      |
| `numeric_id` (expand)      | `bigint identity` | NO                              | sequence                     |
| `code` (expand)            | `text generated`  | generated จากเลขที่ไม่เป็น null | `NTF-` + เลขอย่างน้อย 6 หลัก |
| `user_numeric_id` (expand) | `bigint`          | YES ระหว่าง expand              | จาก `profiles.numeric_id`    |

### weather_observations

ประวัติอากาศที่ผูกสถานีและเวลา.

| คอลัมน์         | PostgreSQL type | Null | ค่าเริ่มต้น        |
| --------------- | --------------- | ---- | ------------------ |
| `station_id`    | `text`          | NO   | `—`                |
| `recorded_at`   | `timestamptz`   | NO   | `—`                |
| `temperature`   | `float8`        | YES  | `—`                |
| `humidity`      | `float8`        | YES  | `—`                |
| `wind_speed`    | `float8`        | YES  | `—`                |
| `wind_deg`      | `float8`        | YES  | `—`                |
| `rain_mm`       | `float8`        | YES  | `—`                |
| `source_at`     | `timestamptz`   | NO   | `—`                |
| `ingested_at`   | `timestamptz`   | NO   | `now()`            |
| `source_status` | `text`          | NO   | `'observed'::text` |

## Schemas สำหรับผู้ดูแล

`private.identifier_aliases(entity, legacy_id, numeric_id, code)` เก็บ mapping แยก namespace และไม่ลบตามรายการ เพื่อไม่ให้ UUID เก่ากลายเป็นรายการใหม่. ไม่เปิด schema นี้ใน PostgREST และไม่มี grant ให้ anon/authenticated.

`review` มี 44 views แบบ security_invoker. ใช้ตรวจ SQL ด้วย postgres หรือ service_role ฝั่ง server เท่านั้น. ไม่มีพิกัดจริง รูป private, LINE ID, token หรือ mapping MBR → USR ใน view บัญชี XP. การเก็บ mapping นี้ยังไม่ใช่ตัวแก้ URL เก่าใน API; resolver จะต้องถูกเพิ่มและทดสอบใน cutover.
