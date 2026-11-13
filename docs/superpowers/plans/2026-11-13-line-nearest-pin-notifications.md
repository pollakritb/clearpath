# แผน LINE notifications และหมุดใกล้ GPS ล่าสุด

วันที่: 2026-11-13

สถานะ: แผนต้นฉบับก่อน implement; ส่วนแกนหลักทำใน local แล้ว ดู [ผลตรวจ](../../verification/2026-11-13-line-nearest-pin.md) และ [runbook](../../runbooks/line-nearest-pin.md) ส่วน production rollout และ capacity gates ยังไม่ดำเนินการ

## 1. ขอบเขตและข้อกำหนดที่ยืนยันแล้ว

- แจ้ง PM2.5 จากหมุดที่ใกล้ GPS จากการใช้งานครั้งล่าสุดของผู้ใช้ โดยรวมสถานีและรายงานชุมชน
- เลือกหมุดก่อนเทียบ threshold; ห้ามเลือกเฉพาะหมุดค่าฝุ่นสูงแล้วค่อยหาอันใกล้ที่สุด
- ความใกล้มาก่อนประเภทต้นทาง ไม่มี station priority หรือ Trust multiplier ในการเลือกนี้
- ไม่ใช้ map center, ผลค้นหา, พิกัดพื้นที่รับคำขอ หรือ IP เป็น GPS แทนผู้ใช้
- ไม่เปลี่ยน IDW, place IDW, gap-fill, Trust, XP หรือ publication policy ของรายงาน
- LINE อัตโนมัติยังมีเพียง measurement_request, measurement_fulfilled และ air_alert
- พื้นที่รับคำขอของผู้ช่วยยังแยกจากตำแหน่งสำหรับแจ้ง PM2.5
- หน้าจอทุกอุปกรณ์ใช้ mobile frame เดิมไม่เกิน 430px และรักษา returnTo/back flow
- Admin/Moderator ดูข้อมูลได้อย่างเดียว การ replay งานเป็นสิทธิ์ server/operator แยกต่างหาก

## 2. สิ่งที่ตรวจพบใน repository

| ส่วน              | หลักฐาน                                                                | ช่องว่าง                                                                                                              |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ตัวสร้างแจ้งฝุ่น  | backend/services/alerts.py                                             | วน station → users; ไม่มี nearest-source selection รวมชุมชน                                                           |
| กฎแจ้งฝุ่น        | backend/algorithms/line_notification_policy.py                         | ใช้ center_lat/lon, อายุข้อมูล 90 นาที และขั้นต่ำ 37.6                                                                |
| GPS ฝั่ง browser  | frontend/hooks/useCurrentLocation.ts                                   | มี accuracy แต่ไม่มี timestamp ในผลลัพธ์; ยอม cached GPS 5 นาที; ไม่ใช่ durable last-visit location                   |
| หน้าตั้งค่า       | frontend/components/panels/community/NotificationSettings.tsx          | ผู้ใช้กดอ่าน GPS และบันทึกเอง; คำอธิบายยังระบุ Air4Thai และศูนย์กลางพื้นที่                                           |
| API contract      | backend/models/notifications.py และ frontend/types/notifications.ts    | ไม่มี location version/เวลา GPS/สถานะความพร้อม; backend threshold รับ 0–500 แต่ UI และ eligibility บังคับขั้นต่ำ 37.6 |
| รายงานชุมชน       | backend/services/store_community.py                                    | list_community_reports มี limit; ห้ามใช้รายการล่าสุดจำนวนจำกัดเป็น candidate ทั้งประเทศ                               |
| คิวส่ง            | backend/services/notifications.py                                      | outbox + lease + retry มีแล้ว แต่ส่งตามลำดับ สูงสุด 100 งานและ soft budget 20 วินาที                                  |
| ความครบของผู้รับ  | notifications.publish_alert                                            | สร้าง event ก่อนวน enqueue; หยุดกลางทางแล้ว rerun อาจข้าม event และผู้รับที่เหลือ                                     |
| LINE HTTP         | backend/services/line_messaging.py                                     | timeout 15 วินาที; HTTP error ถูกแปลงเป็นข้อผิดพลาดทั่วไป; มี retry key แต่ไม่มี shared provider limiter              |
| Webhook           | backend/routers/notifications.py                                       | ตรวจ signature ใน handler แต่ endpoint รอ handler/DB/reply จบก่อนตอบ                                                  |
| ผู้รับจำนวนมาก    | backend/services/store_notifications.py                                | list preferences ไม่แบ่งหน้า; ยังไม่มี indexed spatial recipient evaluation สำหรับกติกาใหม่                           |
| Scheduler         | backend/routers/cron.py และ .github/workflows/production-scheduler.yml | สร้างเหตุการณ์และ drain outbox ใน request; ต้องยืนยัน actual production schedules ก่อนย้ายงาน                         |
| Privacy lifecycle | backend/services/account_privacy.py และ retention jobs                 | ต้องเพิ่ม last-location/inbox/queue/archive ใหม่ใน export, account deletion, retention และ role tests                 |

ข้อค้นพบเป็นการตรวจ code paths ไม่ใช่การรับรอง schema, cron, credentials, quota หรือ extension ที่เปิดอยู่จริงบน production

## 3. นโยบายที่เสนอ ต้องแยกจากข้อกำหนดผู้ใช้

ค่าต่อไปนี้เป็น product defaults ที่เสนอ ไม่ใช่มาตรฐานสากล และต้องอยู่ใน policy version/config กลางพร้อม boundary tests

| เรื่อง         | ข้อเสนอเริ่มต้น                                                                     | เหตุผล/สิ่งที่ต้องตรวจ                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| อายุ GPS       | ไม่เกิน 24 ชั่วโมงนับจากเวลาที่อ่าน GPS จริง                                        | 24 ชั่วโมงยังไม่ได้รับการยืนยันจากผู้ใช้; แสดง last used time ไม่อ้างว่า live                                                                                              |
| ความแม่นยำ GPS | ไม่เกิน 200 เมตรสำหรับบันทึกตำแหน่งแจ้งเตือน                                        | เป็นข้อเสนอสำหรับฟีเจอร์นี้; ต้องตรวจผลต่อ mobile coarse location ไม่ยืมกฎ GPS รายงานมาใช้โดยไม่อธิบาย                                                                     |
| อายุสถานี      | ไม่เกิน 60 นาทีจากเวลาวัด                                                           | เปลี่ยนจาก alert runtime เดิม 90 นาที; ต้อง migration policy และ regression tests                                                                                          |
| อายุชุมชน      | ไม่เกิน 180 นาทีจาก captured_at ที่ server ตรวจแล้ว                                 | อายุสูงสุดไม่แปลว่าค่าชุมชนเทียบเท่าค่าเฉลี่ยสถานี                                                                                                                         |
| รัศมีสูงสุด    | ใช้ค่ารัศมีที่ผู้ใช้บันทึกไว้; เดิม default 10 กม. ช่วง 1–50 กม.                    | เปลี่ยนชื่อเป็นระยะค้นหาหมุด ไม่ใช่รัศมีรับทุกสถานี                                                                                                                        |
| Threshold      | คงขั้นต่ำ 37.6 และค่าที่ผู้ใช้ตั้งสูงกว่านั้น                                       | ทำ contract/backend/UI ให้ตรงกัน; ไม่เพิ่ม AQI/มาตรฐานสุขภาพใหม่                                                                                                           |
| ลด spam        | แจ้งครั้งแรกที่ถึงเกณฑ์และเมื่อระดับรุนแรงขึ้น; ไม่เตือนซ้ำระดับเดิมระหว่าง episode | เงื่อนไข reset เสนอให้พบข้อมูลใหม่ต่ำกว่า threshold ต่อเนื่อง 30 นาที; no-data ไม่ใช่ recovered; พักการเตือนปกติอย่างน้อย 60 นาทีระหว่าง episode โดย escalation ข้ามพักได้ |

หากไม่พบหมุดสดในรัศมี ให้ no_source และไม่ส่ง ห้าม fallback ข้อมูลหมดอายุ/forecast/IDW หรือหมุดไกลเกินรัศมี

## 4. นิยาม GPS ล่าสุดและ lifecycle

1. เพิ่ม authenticated API แยกสำหรับ last-location ไม่ใช้ PUT preferences ทั้งก้อน; user_id มาจาก auth เท่านั้น
2. เก็บ latest point, accuracy_m, position_observed_at, server_received_at, location_version และ origin ของ GPS ไม่สะสมประวัติการเดินทางโดยไม่จำเป็น
3. แยกเวลาที่ browser กลับมาใช้งานออกจากเวลาที่ GPS ถูกอ่าน; cached GPS ห้ามถูกทำให้ดูใหม่ด้วย server_received_at
4. ตอนเปิดแอป/กลับจาก background ให้อ่าน GPS แบบมี throttle เมื่อได้รับสิทธิ์แล้ว; ไม่เปิด permission prompt ทุกหน้า และไม่ติดตามเมื่อปิดแอป
5. รองรับการเข้าเว็บทุก route ไม่ใช่เฉพาะ map; ใช้จุดเชื่อมระดับ app ที่ไม่ทำให้ guest ส่งข้อมูลระบุตัวตน
6. ปฏิเสธ NaN, infinity, พิกัดเกินช่วง, accuracy ติดลบ/เกินนโยบาย, timestamp อนาคตหรือเก่าเกินนโยบาย; ใช้เวลาฝั่ง server เป็นหลักควบคุม clock skew
7. conditional update กัน callback เก่า/network retry หลายแท็บหรือหลายอุปกรณ์ทับตำแหน่งใหม่; ถ้าเวลาเท่ากันใช้กติกา deterministic
8. ไม่มี permission, unsupported, timeout หรือ offline ให้สถานะที่อธิบายได้; ไม่เลื่อนอายุตำแหน่งเก่า และไม่เอา GPS ใน local storage ส่งให้บัญชีที่เพิ่งสลับเข้า
9. เมื่อปิดการใช้ตำแหน่งสำหรับ noti/ถอน consent ให้ invalidate version และยุติงาน pending; ล้างข้อมูลตาม retention ที่กำหนด
10. การถอนสิทธิ์ OS นอกแอปตรวจย้อนหลังไม่ได้ทันที; ต้องอธิบายขอบเขตนี้และมี stop/clear ในแอป

## 5. Candidate และ nearest-source algorithm

- อ่าน snapshot เวลาเดียวกัน: now, location_version, preference_version, policy_version และ source revision
- Station: ใช้ latest valid observation ของแต่ละสถานีจาก Supabase ตาม pipeline เดิม ไม่เรียก Air4Thai ต่อผู้ใช้
- Community: ใช้ approved/published records ที่ยังดูได้และ captured_at สด; pending/rejected/removed ไม่เข้า ไม่เพิ่ม Trust ≥60/สองคน/สอบเทียบเป็น gate ของ direct-pin selection
- Community ใช้ public coordinates ที่ stable; ห้าม fallback exact coordinates หาก public point หาย
- Map cluster เป็นเพียงการแสดงผล: ห้ามนำ cluster center, cluster count หรือค่าเฉลี่ย cluster มาเป็นต้นทางแจ้งเตือน
- ระยะใช้ haversine จาก GPS จริงของเจ้าของบัญชีไปยังตำแหน่งหมุดที่แสดงต่อสาธารณะ
- Query spatial index + freshness/status ก่อน LIMIT nearest; ห้าม limit เฉพาะ 200/500 รายงานล่าสุดของทั้งประเทศ
- แยก candidate index ของ station/community ได้ แต่ต้องเทียบ nearest ของทั้งสองฝั่งเพื่อเลือก global nearest ที่ผ่านเกณฑ์
- กรณีระยะเท่ากัน: เลือกเวลาวัดใหม่กว่า แล้ว stable source key; ไม่สลับประเภทโดยพลการ ไม่เลือกค่าสูงกว่าเป็นตัวตัดสิน
- ใช้ raw valid PM2.5 เทียบ threshold ก่อนปัดแสดง; ล็อก precision/boundary policy ให้ข้อความไม่ชวนเข้าใจผิด
- ผล pure function ต้องคืน source type/id/revision, source timestamp, distance, pm25, reason และ policy version; ไม่ทำ I/O
- เมื่อหมุดใกล้หมดอายุให้ประเมินหมุดสดถัดไป; การเปลี่ยน source อย่างเดียวไม่ reset episode/cooldown
- รายงานของเจ้าของบัญชีเองยังนับเป็น candidate ตามคำสั่งที่รวมรายงานผู้ใช้ เว้นแต่มีนโยบายเพิ่มเติมภายหลัง
- ถ้าข้อมูลอยู่ในช่วง gap จาก cron ให้ระบุความสดจริง ไม่เรียกว่าการแจ้งเตือน real-time

## 6. Evaluation, episode และการเปลี่ยนแปลงระหว่างรอส่ง

- Trigger เมื่อ GPS/threshold/radius/consent เปลี่ยน, station sync สำเร็จ, approved report เพิ่ม, report หมดอายุหรือถูกนำออก และ periodic reconciliation
- สร้าง durable evaluation jobs แบ่งผู้ใช้เป็นหน้า/พื้นที่ พร้อม cursor; debounce และ coalesce ต่อ user/version เพื่อลดงานซ้ำ
- คง last evaluated revision และ episode state; dedup ระดับ user+episode+severity ไม่ใช่เฉพาะ source observation
- no_source, stale_location และ quiet-hours ไม่เท่ากับ low/recovered
- quiet-hours: รวมเป็นการประเมินสถานการณ์ล่าสุดหลังหมดช่วงพัก ไม่ปล่อยข้อความเก่าทั้งก้อน; ไม่ consume provider attempt
- สร้าง in-app event กับ outbox แบบ transaction; success state หมายถึง provider accepted ไม่ใช่อ่านแล้ว
- ก่อน first provider attempt ตรวจ current versions/source availability/consent/quiet-hours อีกครั้ง
- หาก context เปลี่ยนก่อน attempt ให้ supersede และสร้างงานใหม่ ไม่แก้ immutable payload ของงานเก่า
- หลังมี provider attempt ที่ผลไม่แน่ชัด ให้ reconcile/retry เฉพาะ request เดิมภายในขอบเขต LINE retry key; ห้ามเปลี่ยนผู้รับหรือ payload ใช้ key เดิม
- ไม่สามารถรับประกันถอนข้อความที่ LINE รับไปแล้ว; บันทึก accepted time กับ source/location version เพื่อ audit
- ใช้ transactional user-state lock/CAS และ worker fencing ลดการส่งพร้อมกัน/การเขียนผลจาก worker lease เก่า

## 7. Durable queue, workers และ LINE API

### 7.1 รับ webhook

- อ่าน raw body ขนาดจำกัดและตรวจ HMAC signature ก่อน business processing
- บันทึก events ทั้ง request อย่าง durable พร้อม unique webhookEventId; valid empty verification events ต้องตอบได้
- ตอบ 200 หลัง commit เท่านั้น; persist ไม่สำเร็จต้องไม่ตอบสำเร็จลวง
- duplicate ที่บันทึกแล้วตอบ 200 โดยไม่สร้างงานซ้ำ; crash หลัง persist ก่อน HTTP response ต้อง recover ได้
- ประมวลผล linking/unfollow/follow แบบ per-user ordering โดยพิจารณา event timestamp/redelivery; event เก่าห้ามเปิดรับหลัง unfollow ใหม่
- link-code consumption และการผูก LINE ID ต้อง atomic, single-use, ownership-safe และไม่ log plaintext code/token
- ให้ reply jobs มี priority/expiry เพราะ reply token อายุจำกัดและใช้ซ้ำไม่ได้; ห้าม retry reply แบบ push หรือ fallback push โดยไม่มีกติกา

### 7.2 ส่งข้อความ

- ใช้ transactional outbox เดิมเป็น source of truth; ประเมิน Supabase Queues/PGMQ logged durable queue ใน local/staging ก่อนเลือกจริง
- Queue เก็บ job reference เป็นหลัก; ไม่ทำ DB + external queue dual write ที่ไม่มี relay/reconciliation
- Worker deployment แยกจาก web request; ยืนยันผู้ให้บริการ worker/cost/secrets/network/pool ก่อน production
- Atomic claim/visibility timeout, bounded concurrency, lease heartbeat/fencing และ ack หลังบันทึกผลสำเร็จ; ไม่ ack ตั้งแต่อ่าน
- Shared limiter แยก channel/endpoint ครอบคลุม worker ทุกตัว รวม retries และ test messages; circuit breaker เมื่อ LINE ขัดข้อง
- แยก 429 rate limit กับ quota/budget, 5xx/network timeout, permanent payload errors และ credential/config errors
- Retry ตามประเภท ใช้ backoff+jitter; อ่าน Retry-After หากมี; ไม่ยิงซ้ำถี่เมื่อโควตาหมด
- Immutable request (body + recipients), stable UUID retry key ตั้งแต่ครั้งแรก, record first_attempt_at/provider_request_id และ deadline ไม่เกินข้อจำกัด retry key
- 409 ถือว่า accepted เฉพาะบริบท accepted retry request ที่ตรวจสอบได้; uncertain หลัง key หมดอายุห้าม blind replay
- Multicast ใช้ได้เมื่อ payload เหมือนกันจริงและทุก recipient ยัง eligible; เก็บ batch membership คงเดิมต่อ request พร้อมผลรายผู้รับ
- Broadcast ไม่ใช้เป็นทางลัดข้ามพื้นที่/consent; multicast ลด API calls ไม่ลด quota ตามผู้รับ
- คงการแจ้งคำขอ/fulfilled เดิมพร้อม expiry และ recheck; ไม่ให้คิว PM2.5 จำนวนมากทำให้ reply/linking/request หมดเวลา
- แยก dead เพราะ provider failure ออกจาก cancelled/superseded/expired/policy-suppressed; operator replay ต้อง recheck context และบันทึก audit

## 8. Data model, API, privacy และประสิทธิภาพ

รายการต่อไปนี้เป็น logical entities ให้ review ก่อนสร้าง migration ไม่ได้สั่งสร้างตารางทั้งหมดทันที

| Entity                   | ข้อมูลสำคัญ                                            | ข้อบังคับ                                                             |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Latest alert location    | point, accuracy, observed/received time, version       | เจ้าของอ่านได้; ห้าม public feed; worker เข้าถึงตามสิทธิ์             |
| Evaluation/episode state | last source/version, severity, episode, recovery state | atomic CAS; เปลี่ยน source ไม่ล้าง dedup                              |
| Webhook inbox            | event ID, event time, processing status, expiry        | unique; raw contents retention สั้น; worker only                      |
| Fanout/evaluation job    | cursor, snapshot/version, status                       | ทำต่อได้; ไม่ตกหล่นหลัง crash                                         |
| Outbox/delivery attempt  | immutable payload ref, retry UUID, expiry, result      | unique logical delivery; claim/fencing; provider error classification |

- Mirror contracts ใน backend models/schema exports และ frontend types; เพิ่ม contract tests รวม local demo adapters
- เพิ่ม API ownership/validation/rate-limit tests และ stale write protection; GPS endpoint ไม่รับ user_id ของคนอื่น
- RLS บน exposed tables; grant/RPC/search_path/service-only privileges ต้อง review; ไม่เปิด queue/LINE IDs/GPS ให้ anonymous หรือ admin browser
- Spatial indexes สำหรับ public source coordinates, active recipient locations และ due-job indexes; ตรวจ EXPLAIN ด้วยข้อมูลสมจริงก่อนเลือก partition
- Pagination/keyset ต้องครอบคลุมผู้ใช้ทุกคน ไม่พึ่ง PostgREST default row limit หรือ global newest-N list
- ใช้ query projection และ caching source snapshot ลด N+1 โดยไม่ทำข้อมูลคนละคนรั่ว
- Index จริงต้อง migrate แบบเหมาะกับขนาดตาราง/lock; ตรวจ connection pool เมื่อหลาย workers ทำงาน
- ลบ last-location, pending jobs และ recipient references เมื่อ account ถูกลบ; tombstone/revoke ตรวจได้แม้ worker ถือ job อยู่
- Export ข้อมูลเจ้าของบัญชีตาม policy; logs ห้าม exact GPS, LINE ID, raw webhook, access token, reply token หรือ image signed URL
- Archive เฉพาะงาน terminal หลัง export สำเร็จและตรวจ checksum; retention ของ raw payload/dedup tombstone ต้องไม่สั้นจน replay ส่งซ้ำ
- Partition/sharding พิจารณาจาก query plans, storage, lock contention และ SLA ไม่ใช้จำนวนบัญชีล้านคนอย่างเดียว

## 9. Mobile UX และ navigation

- เปลี่ยนคำอธิบาย Air4Thai-only เป็นหมุดสถานีหรือรายงานชุมชนที่ใกล้ตำแหน่งใช้งานล่าสุด
- แสดง location readiness: พร้อม/ยังไม่มี GPS/ต้องอัปเดต/ถูกปฏิเสธสิทธิ์/ไม่มีหมุดสด โดยไม่บังคับเปิด map
- แสดง last observed time และปุ่มอัปเดตตำแหน่ง; ไม่อ้างว่าติดตามเมื่อปิดเว็บ
- ระดับฝุ่น, ระยะค้นหาหมุด, quiet-hours และ LINE consent ต้องแยกหน้าที่จากพื้นที่รับคำขอ
- บันทึก/ยกเลิกแก้ไข/โหลดใหม่/ส่งทดสอบต้องแสดงผลจริง ไม่ optimistic ว่าตำแหน่ง server เปลี่ยนก่อนสำเร็จ
- Profile → settings → notifications → กลับ/ปิด ต้องกลับต้นทางเดิมทั้ง map/air/direct link
- ข้อความ LINE ระบุ PM2.5 µg/m³, ประเภทต้นทาง, เวลาวัด/อายุ, ระยะโดยประมาณ และคำว่าตำแหน่งใช้งานล่าสุด
- Community เป็นการอ่านจากหมุดรายงาน ไม่อ้างเป็นค่ามาตรฐานสถานี/ค่าเฉลี่ย 24 ชั่วโมง; ตรวจ averaging period ที่ต้นทางให้ถูกต้อง
- Deep link ไป source type/id ที่ถูกต้อง; report ต้องไม่เผย exact GPS/ภาพ private; source หายหรือ expired มี fallback อธิบาย ไม่เปิดผิดหมุด
- ทดสอบหน้าจอ 320/375/390/430px, keyboard, focus, touch targets, screen reader และ offline/error states

## 10. Test matrix และเกณฑ์ผ่าน

| กลุ่ม          | กรณีที่ต้องครอบคลุม                                                                                                          | เกณฑ์ผ่าน                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pure selection | station/community ใกล้กว่า, ใกล้ค่าต่ำ-ไกลค่าสูง, equal distance, own report, zero/NaN/negative, cluster                     | เลือก global nearest eligible และ deterministic; threshold ไม่เปลี่ยน source            |
| Freshness      | พอดี 60/180 นาที, เกินขอบ, future time, captured vs created, source removed                                                  | ใช้ clock เดียว; ปฏิเสธต้นทางผิดเงื่อนไข                                                |
| GPS            | cached timestamp, denied/unavailable, 200m boundary, stale/future, foreground, multiple tabs/devices, logout/login           | ไม่สลับบัญชี ไม่ทำตำแหน่งเก่าดูใหม่ ไม่ overwrite ใหม่ด้วยเก่า                          |
| Policy         | 37.5/37.6/75.0/75.1, custom threshold, radius boundary, cooldown, recovery, no-data                                          | สอดคล้อง backend/UI ไม่ spam หรือ reset episode โดย source switch                       |
| Quiet-hours    | ข้ามเที่ยงคืน, start=end, sourceหมดอายุช่วงพัก                                                                               | ประเมินใหม่ ไม่ส่ง backlog เก่า                                                         |
| Atomicity      | crash หลัง event ก่อน fanout, กลาง cursor, หลัง enqueue ก่อน commit                                                          | rollback หรือ resume ครบ ไม่มี missing recipients/duplicate logical jobs                |
| Worker         | simultaneous claim, lease expiry, stale worker, crash หลัง LINE accepted ก่อน DB update                                      | ไม่ ack ก่อนผล durable; retry request เดิม ไม่สร้างข้อความใหม่ซ้ำ                       |
| Provider       | 200, accepted 409, other 409, 400/401/403, 429 สองประเภท, 5xx/timeout, retry key >24h                                        | แยกผลถูกต้อง จำกัดอัตรารวม ไม่ blind retry                                              |
| Webhook        | invalid/raw-body signature, duplicate, multi/empty events, DB failure, redelivery/out-of-order, expired reply/link code race | durable inbox ครบ; valid normal load ตอบเร็ว; unauthorized ไม่ทำ side effect            |
| Race           | GPS/consent/threshold/source เปลี่ยนทุกช่วง, account deletion, unlink/unfollow                                               | งานใหม่ตาม context; งานเก่า superseded; ไม่แก้ payload หลัง attempt                     |
| Privacy        | cross-user read/write/RPC, anon, admin, logs, archive/export/delete                                                          | ไม่รั่ว GPS/LINE IDs; admin ไม่มี mutation                                              |
| Regression     | measurement request/fulfilled, in-app unread/read-all, demo mode, scheduler fallback                                         | 3 event types เดิมทำงานและไม่ส่งสองทางซ้ำ                                               |
| Mobile E2E     | ทุกปุ่มในหน้า LINE/settings/GPS/deep link/back รวม error/retry                                                               | กลับต้นทางเดิม ไม่มี loop/dead end และไม่อ้างการบันทึกที่ล้มเหลวว่าสำเร็จ               |
| Load/fault     | ผู้รับจำลอง 10k/100k/1m, worker หลายตัว, คิวค้าง, LINE outage, DB slowdown                                                   | วัด backlog age, throughput, DB pool, p95/p99, quota budget; ไม่มี real mass LINE sends |

Property-based/model tests ให้ตรวจ invariants หลายเส้นทาง เช่น ไม่มี source ที่ใกล้กว่าในชุด eligible, ไม่ส่งหลัง opt-out และ logical delivery เดียวไม่ถูกสร้างซ้ำ ไม่ใช้จำนวนเส้นทางเป็นหลักฐานความครอบคลุมอย่างเดียว

เป้าหมายเริ่มต้นที่ต้อง benchmark: webhook normal-load p99 <1 วินาทีเพื่อมีระยะเผื่อก่อน LINE 2 วินาที; evaluation หลังข้อมูลเข้าเป้าหมาย p95 <60 วินาทีในกลุ่มทดลอง ทั้งนี้ไม่รวมรอ upstream station sync/quiet-hours/โควตา ไม่ถือว่าได้ SLA จนมีผลทดสอบ

## 11. ลำดับ implement และ release gates

1. ล็อก policy defaults และตัวอย่าง nearest-pin กับผู้ใช้; สรุป TTL GPS, freshness, accuracy และ recovery/cooldown เป็น versioned policy
2. สร้าง failing tests สำหรับกติกาใหม่ แล้วทำ pure selector/episode logic; ไม่แตะ IDW
3. เพิ่ม schema/API location และ versioned state แบบ additive พร้อม RLS, contract, privacy lifecycle และ rollback plan
4. เชื่อม GPS ระดับ app และ mobile settings พร้อม returnTo flow; local demo ต้องจำลองทุกสถานะได้
5. ทำ durable inbox, atomic fanout/outbox และ provider error classification ก่อนเพิ่ม parallelism
6. ทำ queue/worker/shared limiter/quota/observability และตรวจ hosting จริง; ปิด automatic send ใน local tests
7. Shadow evaluation เทียบ legacy โดยไม่ส่ง เก็บเหตุผลเลือกหมุด/ไม่ส่งแบบไม่เผยพิกัดจริง
8. Run focused + full regression, migration/RLS integration, mobile E2E, fault/load tests และตรวจคำเตือน/ข้อจำกัด
9. เปิด canary กลุ่ม opt-in ที่ได้รับอนุญาต ตรวจ accepted/duplicate/backlog/cost แล้วค่อยเพิ่มสัดส่วน
10. Cutover writer/consumer มี switch แยก ห้ามให้ old cron กับ new worker ส่ง logical event เดียวกัน; rollback เป็นหยุดแจ้งใหม่ก่อน ไม่ fallback ไปกติกาสถานีเก่าโดยเงียบ

ก่อน production ต้องยืนยันจริง: deployed migration/extension versions, cron ทั้ง primary/backup, LINE webhook redelivery/error stats, endpoint limits/โควตาบัญชี, worker runtime/secrets, pool size, alert channels และ retention schedule

## 12. Observability และ runbook

- Metrics: GPS readiness/stale/no_source, evaluation lag, fanout cursor lag, pending age, active leases, accepted vs failed, retry reason, dead/expired/superseded, webhook latency/errors, quota utilization และ rate-limiter wait
- Dashboard counts ต้อง aggregate backlog จริง ไม่ใช้แค่ 1,000 แถวล่าสุด
- Correlation: internal event/job/attempt ID + provider request ID; user references ต้องลดการระบุตัวตนและไม่แสดงพิกัดใน logs
- Runbooks: LINE outage/quotaหมด, DB outage, stuck leases, poison job, webhook backlog, token rotation, archive failure, worker rollback และ incident duplicate deliveries
- LINE ล่มต้องมีช่องทางแจ้ง operator อื่นที่ไม่พึ่ง LINE เดียวกัน; ไม่เพิ่มปุ่ม replay ให้ read-only admin

## 13. ผลตรวจรอบวางแผน

- Backend focused tests: alerts service, LINE security, notifications service, LINE policy/allowlist, replay, timing/message policy และ TypeScript/OpenAPI contract ผ่าน 104 tests
- Frontend focused tests: NotificationSettings และ useCurrentLocation ผ่าน 6 tests
- Vitest มีคำเตือนล่วงหน้าเรื่อง configLoader/native กับ vitest.config.ts แต่ไม่ทำให้การทดสอบล้มเหลว
- ผลเหล่านี้ยืนยันพฤติกรรมเดิมในขอบเขตชุดทดสอบ ไม่ได้ยืนยัน nearest-pin, worker architecture ใหม่, UI flow ใหม่ หรือความจุผู้ใช้ล้านคน
- รอบนี้ไม่ได้ตรวจ production DB/LINE Console หรือส่งข้อความจริง; release gates ในข้อ 11 ยังเป็นงานที่ต้องทำ
- เปลี่ยนเพียงเอกสารแผนฉบับนี้ ไม่มี runtime/schema changes, commit, push หรือ deploy

## 14. เอกสารอ้างอิง

- LINE webhook signature/async/redelivery: https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE webhook timeout 2 seconds: https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/
- LINE retry key, immutable request และขอบเขต 24 ชั่วโมง: https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
- LINE endpoint/channel rate limits และ sending API: https://developers.line.biz/en/reference/messaging-api/nojs/
- LINE quota/message counting: https://developers.line.biz/en/docs/messaging-api/pricing/
- Supabase durable queues: https://supabase.com/docs/guides/queues

ข้อกำหนด nearest GPS เป็น requirement ของผลิตภัณฑ์; TTL/freshness/cooldown ในเอกสารนี้ไม่ควรถูกอ้างว่าเป็นมาตรฐานสากลหรือคำรับรองด้านสุขภาพ
