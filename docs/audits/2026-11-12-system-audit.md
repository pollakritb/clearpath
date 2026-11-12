# ClearPath — รายงาน audit ทั้งระบบ

วันที่ 12 พฤศจิกายน 2026 · ตรวจ commit `4e3730663810087955d581652ae4bc3d2fa87e8e`

## ข้อสรุป

โครงสร้างของผลิตภัณฑ์สอดคล้องกันในภาพรวม: mobile frame เดียว, แยก frontend/backend, จำกัดสิทธิ์งานอัตโนมัติจาก Admin และแยก Trust ออกจาก XP/IDW แต่การแสดงข้อมูลย้อนหลังยังมีข้อผิดพลาดด้านความถูกต้องที่ควรแก้ก่อนเพิ่มฟีเจอร์

พบ **7 กลุ่มปัญหาจากโค้ดหรือการจำลองที่ยืนยันได้: P1 จำนวน 1, P2 จำนวน 6** ไม่พบ P0 ในขอบเขตที่ตรวจ และมี **3 ประเด็นเสี่ยง/ข้อจำกัดที่ต้องตรวจเพิ่ม** ซึ่งไม่นับเป็นบั๊ก production ที่ทำซ้ำแล้ว

การที่ชุดทดสอบเดิมผ่านไม่ได้แปลว่าครอบคลุมทุกสถานะ: เพิ่มกรณีจำลองเฉพาะกิจ 4 กรณีแล้วสามารถยืนยันพฤติกรรมผิดของกราฟและการโหลดข้อมูลได้จริง

งานรอบนี้เป็น audit: ไม่แก้ runtime code, ไม่เปลี่ยนฐานข้อมูล/cron, ไม่ส่ง LINE จริง และไม่ commit/push/deploy สร้างเฉพาะรายงานนี้กับสรุปหลักฐาน

## วิธีตรวจและขอบเขต

- ตรวจโค้ด frontend, FastAPI, authentication/authorization, OCR/report publication, measurement requests, Trust/XP, IDW, notifications, private images และ deployment configuration
- ใช้แนวทางจาก Impeccable audit, Web Design Guidelines, Vercel React best practices, FastAPI, Supabase และ Supabase Postgres best practices
- รัน unit/integration tests, build, static checks, dependency audit และ SQL integration ใน PGlite แยกจาก production
- รัน browser tests กับ local build บน Chromium แบบ touch/mobile ที่ 320×568, 360×640, 390×844 และ 430×932
- Production ตรวจ HTTP แบบอ่านอย่างเดียว และตรวจ Supabase catalog/permissions/cron/aggregate job results ด้วย read-only queries
- ไม่สร้างบัญชี production ใหม่ ไม่ทำ Google OAuth/OTP จริง ไม่ทดสอบส่ง LINE จริง ไม่เรียก OCR ที่คิดค่าบริการ และไม่ทำ load test production
- แบบจำลองล็อกอิน/กล้อง/ตำแหน่งในชุด E2E ไม่เท่ากับการทดสอบบน iPhone Safari หรือ Android จริง

## คะแนนคุณภาพ UI ตามกรอบ Impeccable

คะแนนนี้เป็นการประเมินทางวิศวกรรมเฉพาะขอบเขตที่ตรวจ ไม่ใช่ใบรับรอง WCAG หรือผล Core Web Vitals จากผู้ใช้จริง

| มิติ                     |  คะแนน /4 | หลักฐานและข้อจำกัด                                                                                             |
| ------------------------ | --------: | -------------------------------------------------------------------------------------------------------------- |
| Accessibility            |         3 | หน้าและสถานะที่มี Axe tests ผ่านเกณฑ์ serious/critical; ยังมีข้อความหมุดเล็ก และไม่ได้ทดสอบ screen reader จริง |
| Performance              |         2 | build และ navigation cache tests ผ่าน แต่ยังไม่มี p95 latency, RUM หรือผล capacity test                        |
| Theming                  |         3 | ใช้ระบบสี/ตัวแปรร่วมกัน; กราฟเดิมยังใช้คำและเกณฑ์ที่ต่างจากส่วนใหม่                                            |
| Responsive               |         4 | ชุด mobile 4 ขนาดผ่าน รวม overflow, focus และแผงย่อ/เต็มในสถานะที่มีเทสต์                                      |
| Implementation integrity |         2 | พบกราฟย้อนหลัง 2 implementation ที่รักษาเวลา/สเกลไม่เท่ากัน และ request race                                   |
| **รวม**                  | **14/20** | **Good ตามช่วงคะแนนของ skill; ต้องแก้ความถูกต้องของข้อมูลก่อน**                                                |

## ผลการทดสอบ

| การตรวจ                        | ผล                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Frontend Vitest                | 91 files, 426 tests ผ่าน                                                                                                  |
| Frontend coverage              | statements 93.15%, branches 86.58%, functions 91.21%, lines 94.15% **เฉพาะ scope ใน vitest.config.ts**                    |
| Backend pytest                 | 651 ผ่าน; coverage 81.60%; 1 warning เรื่อง Starlette/httpx deprecation                                                   |
| Mobile Playwright              | 310 ผ่าน, 6 skipped, ไม่มี failure; รวม 316 กรณีใน test matrix                                                            |
| กรณีจำลอง audit เพิ่มเติม      | 4 ผ่านในความหมายว่า “พิสูจน์พฤติกรรมผิดได้”; ไม่ใช่ regression tests ที่ยืนยันว่าแก้แล้ว                                  |
| ESLint / TypeScript / Prettier | ผ่าน                                                                                                                      |
| Ruff lint / Ruff format        | ผ่าน                                                                                                                      |
| Next production build          | ผ่าน                                                                                                                      |
| npm audit:ci                   | ไม่พบ high/critical ที่ทำให้ check ล้มเหลว                                                                                |
| pip-audit                      | ไม่พบ known vulnerabilities                                                                                               |
| SQL integration                | Trust, contribution-v3, registered requests, legacy retention, external feeds, CAMS grid, numeric identifier cutover ผ่าน |

6 skipped มาจากเทสต์ที่ตั้งใจรันเพียง project เดียว: map-tab-continuity เฉพาะ 390 และกรณี mobile-pages เฉพาะ 320 จึงข้ามซ้ำในอีก 3 ขนาดต่อกรณี ไม่ใช่ 6 ฟีเจอร์ที่พิสูจน์ว่าใช้งานไม่ได้

Coverage frontend ไม่รวมทุกหน้าจอและทุก component จึงห้ามใช้ตัวเลข 93.15% อ้างว่าแพลตฟอร์มทั้งระบบมี coverage เท่านี้

## ปัญหาที่ยืนยันได้

### F01 · P1 · กราฟหน้า “วันนี้” ตัดค่าฝุ่นสูงและใช้เส้นอ้างอิงที่ไม่ตรงกับ UI ส่วนอื่น

- **ตำแหน่ง:** `frontend/components/panels/HistoryChart.tsx:8`, `:11`, `:125`; ใช้งานจริงผ่าน `AQICard.tsx:244` และ `TodayPageClient.tsx`
- **ประเภท:** Implementation integrity / การสื่อสารค่าฝุ่น
- กำหนด `MAX = 90` แล้ว clamp ทุกค่า ทำให้ 100 และ 300 แสดงที่ยอดกราฟเท่ากัน ผู้ใช้จึงไม่เห็นความต่างของเหตุการณ์ค่าฝุ่นสูง
- ระบุ “เส้นอันตราย 50” ขณะที่ส่วนระดับสีของผลิตภัณฑ์แบ่งที่ 37.6 และ 75.1 ข้อความนี้ไม่มีคำอธิบายเรื่องช่วงเวลาเฉลี่ยหรือที่มาของเกณฑ์
- **หลักฐานจำลอง:** ส่งค่า 100 และ 300 ได้ SVG line `M 0.0 0.0 L 320.0 0.0` และยังมีข้อความ “เส้นอันตราย 50”
- **แนะนำ:** ใช้ dynamic y-axis ที่รองรับค่าจริงและมีหน่วย/ตัวเลข; ใช้ source of truth ของระดับ PM2.5 เดียวกับ UI ส่วนอื่น พร้อมอธิบายฐานเวลาของการแปลผล อย่านำเกณฑ์ 24 ชั่วโมงไปกล่าวอ้างเป็นมาตรฐานค่ารายชั่วโมงโดยไม่มีคำอธิบาย
- **เกณฑ์รับงาน:** 100 กับ 300 อยู่คนละระดับความสูง, จุดทุกจุดอยู่ในสเกล, คำอธิบายระดับตรงกันทั้งหน้า today และ station sheet
- **คำสั่ง skill ที่เหมาะ:** `$impeccable clarify` และ `$impeccable harden`

### F02 · P2 · กราฟหน้า “วันนี้” เชื่อมข้ามช่วงข้อมูลหายและติดป้ายเวลาเกินหลักฐาน

- **ตำแหน่ง:** `frontend/components/panels/HistoryChart.tsx:22`, `:66`, `:124`
- **ประเภท:** Implementation integrity / UX ข้อมูลขาดช่วง
- กรองค่าที่เป็น null ทิ้ง แล้วกระจายจุดที่เหลือด้วยลำดับ index ไม่ใช้ `recorded_at`
- จุด 01:00 กับ 20:00 จะเชื่อมต่อกัน แม้มีช่วงไม่มีข้อมูล และจุดสุดท้ายถูกวางข้างป้าย “ตอนนี้” แม้เป็นข้อมูลเก่า
- **หลักฐานจำลอง:** ข้อมูล 01:00=100, 02:00=null, 20:00=300 ยังวาดเส้นเดียวต่อเนื่องจากซ้ายไปขวา
- **แนะนำ:** ใช้แกนเวลาจริงหรือ hourly slots, เว้นเส้นตรงช่วงขาด, แสดง timestamp ของจุดล่าสุด รวม logic กับกราฟใหม่แทนรักษาสองชุด
- **เกณฑ์รับงาน:** null/ชั่วโมงที่ไม่มี record ต้องเป็น gap และข้อมูลเก่าไม่ถูกบรรยายว่าเป็นค่าปัจจุบัน
- **คำสั่ง:** `$impeccable harden`

### F03 · P2 · คำตอบย้อนหลังที่มาช้าทับข้อมูลสถานีใหม่ได้

- **ตำแหน่ง:** `frontend/hooks/useHistory.ts:14`, `:29`; consumer `frontend/components/pages/TodayPageClient.tsx:174`
- **ประเภท:** State consistency / UX เมื่อเครือข่ายช้า
- เริ่มโหลด A แล้ว B; ถ้า B ตอบก่อน A จะได้ `stationId = B` แต่ `points` เป็นของ A เพราะไม่มี request sequence หรือ cancellation guard
- Consumer ตรวจเพียง `history.stationId === selectedStation.id` จึงยังรับข้อมูล A ไปแสดงใต้สถานี B ได้
- `clear()` ไม่ invalidate งานเก่าและไม่ reset loading; งานเก่าสำเร็จแล้วเติม points กลับได้
- **หลักฐานจำลอง:** 2 hook tests ยืนยันทั้ง out-of-order response และ clear ระหว่างรอ
- **แนะนำ:** ใช้ sequence/AbortController, อนุญาตเฉพาะ request ล่าสุดเปลี่ยน points/error/loading และ invalidate เมื่อ clear; อ้างอิงวิธีใน `useMapHistory`
- **เกณฑ์รับงาน:** resolve A หลัง B แล้วกราฟยังเป็น B; clear แล้ว response เก่าไม่คืนข้อมูลหรือ loading
- **คำสั่ง:** `$impeccable harden`

### F04 · P2 · แผงเต็มสถานีเก็บเวลาตอน mount ทำให้ข้อมูลใหม่ถูกมองข้าม

- **ตำแหน่ง:** `frontend/components/app/StationInsights.tsx:49`; `frontend/lib/station-insights.ts:27`
- **ประเภท:** Data freshness / state lifecycle
- `reference` ถูกสร้างครั้งเดียวตอน mount แม้แผงยังย่ออยู่ แต่ history เพิ่งถูกโหลดเมื่อขยาย
- เปิดแผงย่อทิ้งไว้ แล้วขยายหลังชั่วโมงใหม่ ข้อมูลที่ `recorded_at > reference` จะถูกตัดออก แม้ API ส่งกลับมาแล้ว
- **หลักฐานจำลอง:** mount ตอน 01:00 โดย enabled=false, ขยาย 02:05, API คืนจุด 02:00=20 แต่ UI แสดง “ยังไม่มีข้อมูลย้อนหลังในช่วงนี้”
- **แนะนำ:** กำหนดขอบหน้าต่างตอนเริ่มโหลด/ตอนรับข้อมูลสำหรับ live mode และอัปเดตเมื่อ refresh; historical mode ใช้เวลา snapshot ที่เลือกอย่างชัดเจน
- **เกณฑ์รับงาน:** ขยายหลังผ่านชั่วโมงใหม่แล้วเห็นจุดใหม่ โดยไม่ต้องปิดหมุดหรือ reload หน้า
- **คำสั่ง:** `$impeccable harden`

### F05 · P2 · กราฟสถานีย้อนหลังใช้หน้าต่าง API คนละช่วงกับหน้าต่างที่วาด

- **ตำแหน่ง:** `frontend/components/app/StationInsights.tsx:50`, `:57`; `backend/services/store_stations.py:142`; `MapPageClient.tsx:680`
- **ประเภท:** Data window correctness
- เมื่อมี `historicalAt` กราฟสร้าง 24 slots จบที่เวลาย้อนหลังนั้น แต่ยังขอ `api.history(id, 24)` ซึ่ง backend คำนวณเริ่มต้นจากเวลาปัจจุบัน
- **ตัวอย่าง:** ปัจจุบัน 12 พ.ย. 12:00 เลือกย้อนหลัง 12 ชั่วโมง → กราฟต้องครอบคลุมประมาณ 11 พ.ย. 01:00 ถึง 12 พ.ย. 00:00 แต่ API คืนเฉพาะตั้งแต่ 11 พ.ย. 12:00 จึงสูญเสียข้อมูลช่วงต้นที่อาจมีอยู่ใน DB
- ตัวอย่างนี้เป็นการไล่ช่วงเวลาจากโค้ด ไม่ใช่ข้อกล่าวหาว่า production สูญเสียแถวข้อมูล
- **แนะนำ:** ให้ history API รับ `end_at`/`at` แล้วคำนวณ cutoff จากเวลานั้น หรือ fetch ช่วงที่ยาวพอและ trim ใน client โดยกำหนดขอบเวลา/limit ให้ชัด
- **เกณฑ์รับงาน:** เลือกย้อนหลัง 12 และ 24 ชั่วโมงแล้วข้อมูลครบทั้ง 24 slots หาก seed DB มีข้อมูลครบ; อนาคตจาก snapshot ต้องไม่รั่วเข้าแผง
- **คำสั่ง:** `$impeccable harden`

### F06 · P2 · ตรวจ exact duplicate ก่อน OCR ได้เฉพาะ 500 รายงานล่าสุด

- **ตำแหน่ง:** `backend/services/community/evidence.py:66`, `backend/services/store_community.py:418`, `backend/services/community/drafts.py:128`
- **ประเภท:** Backend integrity / ค่าใช้จ่าย OCR / ข้อผิดพลาดเมื่อส่งภาพเดิม
- การหา SHA-256 ซ้ำทำโดยวนรายการ 500 แถวล่าสุดรวมทั้งระบบ ภาพที่เก่ากว่านั้นไม่ถูกจับในขั้นก่อน OCR
- **สิ่งที่ยังป้องกันอยู่:** production มี unique constraint `community_reports_image_sha256_key` จึงไม่ควรสรุปว่าภาพซ้ำสามารถถูกเผยแพร่ซ้ำได้สำเร็จ
- ปัญหาคืออาจเสีย OCR/สร้าง draft ก่อนถูกปฏิเสธตอน insert; ไม่ตรงข้อกำหนดของโครงการที่ต้องกัน exact duplicate ก่อน OCR
- **หลักฐาน:** ตรวจขอบเขต query และลำดับเรียกจากโค้ด พร้อมยืนยัน unique constraint จาก production catalog; ยังไม่ได้สร้าง 501 รายงานจริงบน production
- **แนะนำ:** query ด้วย SHA-256 ตรงบน unique index ก่อน OCR; จำกัด 500 เฉพาะ perceptual similarity ที่ใช้เป็น audit metadata; แปลง unique violation ที่ race เป็นข้อความซ้ำที่ผู้ใช้เข้าใจได้
- **เกณฑ์รับงาน:** seed >500 records แล้วอัปโหลด hash เก่า ต้องไม่เรียก OCR และได้ข้อความซ้ำที่คาดหมาย; ทดสอบ upload พร้อมกันด้วย

### F07 · P2 · ข้อความหมุดกลุ่มเล็กเกินไปบน mobile

- **ตำแหน่ง:** `frontend/styles/user-app.css:11706`; `.cp-official-cluster .cp-cluster-count`
- **ประเภท:** Legibility / responsive
- Impeccable detector ที่ viewport 390×844 พบ 23 occurrences ของข้อความต่ำกว่า 11px ในหมุดกลุ่ม เช่น “สถานี” 10px และตัวเลขบางกลุ่ม 10.56px
- เป็นปัญหาอ่านยาก โดยเฉพาะภาษาไทยและสายตาผู้สูงอายุ; **ไม่กล่าวอ้างว่า 11px เป็นขนาดขั้นต่ำที่ WCAG บังคับ**
- **แนะนำ:** เพิ่มข้อความที่จำเป็นเป็นประมาณ 12px ขึ้นไป ลดคำซ้ำบนหมุดหากแน่น และตรวจให้จำนวนสถานีต่างจากค่า PM2.5 อย่างชัดเจน; รักษา hit area/focus เดิม
- **เกณฑ์รับงาน:** ตรวจจริง 320/390/430px และ text zoom 200%; ตัวเลขกับหน่วยไม่ชนกัน ไม่ทำให้หมุดบังกันมากขึ้น
- **คำสั่ง:** `$impeccable typeset` และ `$impeccable adapt`

## ประเด็นที่ควรตรวจเพิ่ม — ไม่รวมใน 7 กลุ่มข้างต้น

### R01 · P2 risk · LINE test endpoints ไม่มี cooldown ใน application layer

`backend/routers/notifications.py:82` และ `:118` เรียกส่งข้อความโดยตรง; `line_messaging.py:233` ไม่มี per-user rate-limit/dedup ของ test message ต่างจาก outbox งานจริง

ผู้ใช้ที่ล็อกอินและเชื่อม LINE อาจเรียกซ้ำจนกินโควตาส่งร่วมได้ ไม่ได้ทดลองส่งจริงหรือพิสูจน์การทำให้โควตาหมด และยังไม่ได้ตรวจ WAF rules ว่าปิดช่องนี้อยู่หรือไม่

แนะนำใช้ shared DB rate-limit ต่อบัญชีทั้งสอง endpoint, เช่น cooldown 60 วินาทีและเพดานรายวัน พร้อม 429/Retry-After ทดสอบด้วย mocked sender ว่า repeated requests ไม่เกิด provider calls ทุกครั้ง

### R02 · P2 risk · ส่ง draft พร้อมกันอาจเห็นสถานะภายใน pending

`backend/services/community/drafts.py:240` ถ้าพบ report เดิมจะ return ทันที และ map ทุกสถานะที่ไม่ใช่ approved เป็น `automatic_rejected` ระหว่างอีก request ยัง finalize รายงานแรก อาจพบ report สถานะ pending ได้

ยังไม่ทำ multi-request reproduction กับ DB จริง จึงไม่จัดเป็นบั๊ก concurrency ที่ยืนยันแล้ว แนะนำจำลอง barrier หลัง insert และก่อน review; ให้ request ซ้ำรอผลที่ terminal หรือคืนสถานะ retry ที่ไม่สื่อว่าปฏิเสธแล้ว ไม่คืน pending พร้อม automatic_rejected

### R03 · P1 deployment risk · UI ยอมรับภาพ 8 MB แต่เส้นทางผ่าน Function มีขีดจำกัด 4.5 MB

`frontend/components/panels/CameraCapture.tsx:352` ยอมรับภาพถึง 8 MiB และส่งไฟล์ต้นฉบับเข้า `api.photoMetadata(file)` ที่ `:367`; `frontend/lib/api-client.ts:307` ส่ง multipart ผ่าน API และ backend กำหนด 8 MiB เช่นกัน

[Vercel Functions Limits — Request body size](https://vercel.com/docs/functions/limitations#request-body-size) ระบุเพดาน payload 4.5 MB; ขนาด multipart นับรวม overhead ด้วย จึงอนุมานได้ว่าไฟล์บางขนาดที่ผ่าน client จะติด 413 ก่อนถึง FastAPI

ยังไม่ส่งไฟล์ใหญ่จริงเข้า production ใน audit นี้ แนะนำเลือกแนวทางให้ชัด: ถ้ายังคงรองรับภาพต้นฉบับ 8 MB ให้ upload ตรง private storage ด้วย short-lived signed upload แล้วส่ง reference เข้า backend พร้อมตรวจ ownership/content/expiry; ถ้าจำกัดผ่าน Function ต้องลดเพดานให้มี margin และแจ้งก่อนส่ง ระวังการบีบอัดภาพจากคลังทำให้ EXIF ที่จำเป็นหาย

## ผลตรวจตามระบบย่อย

| ระบบ                    | สิ่งที่ตรวจ/ผ่าน                                                                                             | สิ่งที่ยังจำกัด                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Mobile shell/navigation | 4 widths; tabs, Back fallback, close/focus, horizontal overflow, font zoom ในกรณีที่มีเทสต์                  | ไม่ใช่ผล manual usability กับผู้ใช้จริงทุกวัย                                 |
| Map/หมุด/แผง            | ย่อ–เต็ม, scroll/swipe, history, forecast, archived/missing links, tab continuity ผ่านชุด E2E                | F04/F05/F07; ไม่ใช่การสำรวจทุกพิกัดของไทย                                     |
| Today/history/forecast  | unavailable states, forecast table/timeline, cache, source presentation ผ่าน                                 | F01–F03; ยังไม่ profile Core Web Vitals                                       |
| Auth/session            | ตรวจ server verification, role checks, recent-auth, account-change private cache clearing และ tests ที่มี    | ไม่ทำ Google login/OTP production หรือ session revocation แบบ end-to-end จริง |
| Community/OCR           | MIME/size checks, duplicate path, number-only review, rejection privacy, OCR retry/camera draft tests        | F06, R02, R03; ไม่เรียก OCR paid service/กล้องจริง                            |
| Requests/helper         | SQL tests ยืนยัน two-open cap, cancellation release, retries, fixed 2km, invitation/ownership                | ไม่ส่ง invitation/LINE production จริง                                        |
| Trust/XP                | SQL replay, quotas, CAS/reconciliation, retention, role isolation, preserved legacy และ contribution-v3 ผ่าน | ไม่อ้างว่าทดสอบ settlement ทุกข้อมูลจริงหรือทุกช่วงเดือน/ปี                   |
| IDW/privacy             | ตรวจเส้นทาง haversine/eligibility, separation place vs gap-fill, public-coordinate presentation และ tests    | ไม่รับรองความแม่นยำทางวิทยาศาสตร์จากการเทียบเครื่องภาคสนาม                    |
| LINE/inbox              | allowlist 3 events, ownership, retry/outbox logic และ settings tests ผ่าน                                    | R01; ไม่มี receipt จากเครื่องผู้รับจริง                                       |
| Admin                   | routes ที่ตรวจเป็น read-only และ production anonymous GET /admin/reports ได้ 401                             | ไม่ใช้บัญชี Admin จริงเปิดทุก record                                          |
| DB/storage              | catalog/RLS/grants/policies/bucket settings และ isolated SQL integration ผ่าน                                | ไม่ restore backup/PITR จริงหรือ stress DB                                    |
| Cron/deploy             | primary30min, stored HTTP results, latest CI/release readiness ตรวจได้                                       | snapshot ช่วงที่ตรวจ ไม่ใช่ uptime/SLO ระยะยาว                                |

## Production และฐานข้อมูล — หลักฐานเชิงบวก

- Release ที่ตรวจตรงกับ HEAD `4e37306`; Vercel deployment READY; Quality และ Production smoke workflow ของ release นี้สำเร็จ
- `/api/health` และ `/api/ready` ตอบ 200 ณ เวลาที่ตรวจ; ready snapshot แรกมี 179 สถานี แบ่ง fresh126/delayed18/expired35 (ตัวเลขเปลี่ยนตามเวลา)
- Anonymous `/api/notifications`, `/api/notifications/preferences`, `/api/notifications/line`, `/api/admin/reports` ตอบ 401; history hours=0 ตอบ 422 ตาม validation
- การลอง `/api/stations`, `/api/pm25`, `/api/admin/stats` ได้ 404: เป็น path ที่ไม่มีใน router จึงไม่นับเป็นบั๊ก
- ตาราง public ที่ตรวจจาก catalog เปิด RLS ทั้งหมด; ไม่พบ table INSERT/UPDATE/DELETE grant ให้ authenticated และไม่พบ SECURITY DEFINER function ที่ anon/authenticated เรียกได้ในขอบเขต catalog ที่ query
- ตารางที่ anon/authenticated อ่านได้มี policies จำกัด owner สำหรับ profile/helper location/notification ส่วน public map events เป็น feed สาธารณะ
- report-images เป็น private bucket, จำกัด 8 MB และ MIME JPEG/PNG/WebP; announcement-images เป็น public สำหรับภาพประกาศ ข้อจำกัด bucket ไม่ได้ทำให้เพดาน Function เพิ่มขึ้น
- Exact image hash มี unique constraint; report ที่มีอยู่ตอน snapshot เป็น approved17 ไม่มี pending ค้างใน aggregate ที่ตรวจ
- Notification outbox ณ snapshot มี sent25 และไม่พบรายการค้างใน aggregate นี้ ไม่ได้ใช้ผลนี้ยืนยัน delivery ทุกเหตุการณ์ในอนาคต
- Cron 7 jobs active; Air4Thai primary คือ `17,47 * * * *` หรือทุก 30 นาที ไม่ใช่ทุก 5 นาที
- ตรวจ `cron.job_run_details` ย้อนหลัง 24 ชั่วโมง: ทั้ง 7 jobs มีสถานะ succeeded; ตรวจเพิ่มที่ `net._http_response` ย้อนหลัง 12 ชั่วโมงพบ HTTP200 จำนวน876, ไม่มี timeout/non-200 ในข้อมูลที่เก็บไว้ช่วงนั้น จึงไม่ได้อาศัยเพียงสถานะ SQL ที่ enqueue สำเร็จ
- งาน */5 ที่พบเป็น external feeds/Trust reconciliation คนละงานกับ Air4Thai; ชื่อ migration เก่าที่มีคำว่า 5m ไม่ได้แปลว่า cron ปัจจุบันเป็น 5 นาที

## ผล detector และ false positives

Impeccable URL scan บน `/` และ `/air` ที่ 390×844 พบ 26 observations: undersized-ui-text23, straggler1, tiny-text1, nested-cards1

ยืนยัน undersized marker text เป็น F07 โดยรวม 23 occurrences เป็นปัญหาเดียว ไม่พองจำนวนบั๊ก ส่วน straggler/header, nested forecast section และข้อความรอง 11.7px ยังไม่พบผลกระทบการทำงานชัดพอที่จะเพิ่มเป็นบั๊ก ควรทบทวนพร้อม typography pass ไม่ใช่ลบ card หรือข้อมูลโดยอัตโนมัติ

## สิ่งที่ผลตรวจยังตอบไม่ได้

- รองรับ 1 ล้านผู้ใช้หรือ concurrent sessions เท่าไร: รอบนี้ไม่ได้ทำ capacity/load test จึงไม่มีตัวเลขอ้างได้
- p95/p99 API latency, cold starts, database connection ceilings และ LINE/OCR budget เมื่อเกิด burst
- กล้อง/EXIF/permission/back gesture ของ Safari iOS และ Chrome Android จริงทุกเวอร์ชัน
- VoiceOver/TalkBack, low vision และ usability จากผู้ใช้จริง
- Google OAuth/OTP, LINE link/webhook/message receipt และ OCR provider integration จริงแบบครบวงจร
- Backup restore/RPO/RTO, secret rotation และ incident recovery ในสภาพแวดล้อมแยก

## ลำดับแก้ที่แนะนำ

1. **P1 — F01 และตรวจ R03 ก่อน release ถัดไป:** แก้กราฟผิดสเกล/คำอธิบาย และทำให้ขนาด upload ที่ผู้ใช้เลือกตรงกับเส้นทาง deploy
2. **P2 — F02–F05:** รวม history view-model, ใช้แกนเวลาจริง, request cancellation และหน้าต่าง historical ที่ตรงกัน; เพิ่ม regression tests ตามกรณีจำลอง
3. **P2 — F06/R01/R02:** indexed exact-hash lookup ก่อน OCR, shared LINE test cooldown และ concurrent-submit terminal-state test
4. **P2 — F07:** `$impeccable typeset` / `$impeccable adapt` เพื่อแก้ความอ่านง่ายบน mobile
5. รัน checks ที่เกี่ยวข้องและ `$impeccable audit` ซ้ำ; ใช้ `$impeccable polish` เป็นขั้นสุดท้ายหลังความถูกต้องผ่านแล้ว

สามารถสั่งให้ทำรายการเหล่านี้ทีละข้อหรือรวมกันได้ รายงานนี้ยังไม่ใช่คำยืนยันว่าแก้ไขหรือเผยแพร่แล้ว
