# ClearPath — ผลแก้ไข local จาก system audit

แก้ต่อจาก commit `4e37306` โดยยังไม่ commit/push/deploy และไม่เปลี่ยนฐานข้อมูล production

## สิ่งที่แก้แล้ว

| รายการ audit                  | ผลแก้                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 กราฟตัดค่าที่ 90          | หน้า Today และแผงสถานีใช้ `HistoryTimeline` ร่วมกัน; สเกลตามข้อมูลจริง ไม่มีเส้น “อันตราย 50” ที่ไม่มีคำอธิบาย                                                                              |
| F02 กราฟข้ามช่วงข้อมูลหาย     | ใช้ 24 hourly slots ตาม timestamp, เว้นเส้นช่วงไม่มีข้อมูล, เลือกอ่านค่า/วันเวลาได้ และแยก null ออกจากศูนย์                                                                                 |
| F03 คำตอบเก่าทับสถานีใหม่     | ใช้ request sequence + AbortController; clear/unmount invalidate งานเก่า; หน้า Today มีข้อความ error และปุ่มลองใหม่                                                                         |
| F04 เวลาแผงเต็มค้าง           | กำหนดเวลาเมื่อเริ่มโหลดหลังขยาย/ลองใหม่ ไม่ใช่ตอนแผงย่อ mount; ยกเลิกคำตอบจาก request ที่เลิกใช้งาน                                                                                         |
| F05 หน้าต่างย้อนหลังผิดช่วง   | `/api/history` รับ `end_at`; store กรองทั้งจุดเริ่มและสิ้นสุด; historical sheet ส่งเวลาที่เลือก และ local demo ใช้เงื่อนไขเดียวกัน                                                          |
| F06 ตรวจภาพซ้ำเพียง 500 แถว   | ค้น exact SHA-256 ด้วย equality บน unique index เดิมก่อน similarity scan/OCR; จับ unique conflict ของ image hash เป็นข้อความภาพซ้ำ                                                          |
| F07 ข้อความหมุดกลุ่มเล็ก      | ตัวเลขและคำว่า “สถานี” ใช้ 12px; รักษา touch/focus behavior เดิม                                                                                                                            |
| R01 LINE test ซ้ำ             | ทั้งสอง endpoint ใช้ quota action เดียวกัน: 1 ครั้งต่อช่วง 60 วินาที และ 10 ครั้งต่อช่วง 86400 วินาที, ตอบ 429 + Retry-After; ตรวจว่าเชื่อม LINE ก่อนใช้โควตา                               |
| R02 คืน pending เป็น rejected | Retry รอ terminal state ชั่วครู่โดยไม่ finalize ซ้ำ; ถ้ายังไม่เสร็จตอบ 409 + Retry-After 2 วินาที และไม่คืน pending/automatic_rejected ที่ผิด                                               |
| R03 ขนาด upload               | เปลี่ยนเพดานไฟล์/ข้อมูลรวมต่อคำขอเป็น 4,000,000 bytes; client ตรวจรวมก่อนส่ง และ server ตรวจไฟล์/ยอดรวม พร้อม guard multipart ที่ 4,200,000 bytes เพื่อเผื่อ overhead ต่ำกว่าเพดาน Function |

Quota ของ LINE เป็น fixed-window ตาม RPC เดิม ไม่ใช่ sliding cooldown ที่วัดครบ 60 วินาทีจากเวลาส่งครั้งล่าสุด ค่าจำนวนครั้งเป็นนโยบายทางวิศวกรรม ไม่ใช่ข้อบังคับสากล

การปรับ upload เป็นการลดเพดานจากเดิม 8 MB เป็น 4 MB ไม่ได้เพิ่ม signed direct upload หากจะรองรับต้นฉบับ 8 MB ต่อไปต้องทำเส้นทาง private-storage upload เพิ่มต่างหาก รอบนี้ไม่บีบอัดภาพจากคลัง จึงรักษา EXIF เดิม และไม่มี migration ใหม่

ยังคง Air4Thai primary sync 30 นาที, เกณฑ์อายุข้อมูล/IDW, OCR number-only, public-coordinate privacy, LINE allowlist 3 ประเภท และสิทธิ์ Admin แบบ read-only เดิม

## ผลตรวจ

- Frontend unit: **435 ผ่าน / 95 files**; coverage ภายใน scope เดิม statements93.29%, branches86.74%, functions91.24%, lines94.25%
- Backend: **661 ผ่าน**, มี Starlette/httpx deprecation warning เดิม 1 รายการ
- Mobile E2E ชุดเต็ม: **310 ผ่าน / 6 skipped** ตาม project conditions ที่มีอยู่
- หลังเพิ่มคำอธิบายช่วงเวลา/แหล่งอ้างอิงใน build สุดท้าย: ตรวจซ้ำ station full sheet และหน้า Today/report/settings ทั้ง 4 ขนาด **16 ผ่าน**
- TypeScript, ESLint, Prettier, Ruff lint/format และ Next production build ผ่าน
- ตรวจภาพแผงเต็ม/กราฟจริงใน browser ที่ 320px; ชุด E2E ครอบคลุม touch/mobile Chromium 320/360/390/430px
- Detector หมุดกลุ่มไม่พบ undersized-text เดิมแล้ว; observations อื่นที่เหลือ ได้แก่ subtitle ของแบรนด์, line wrapping และ nested forecast section ซึ่งอยู่นอก 7 กลุ่มปัญหาที่กำหนดไว้

กรณี regression ใหม่ครอบคลุม response สลับลำดับ/clear/error, แยก 100 กับ 300, hourly gaps, deferred expansion, historical end_at/cancellation, boundary filtering, exact hash นอก recent window, image uniqueness conflict, pending retry, shared LINE quota และ combined upload ก่อน network

## แหล่งอ้างอิงและขอบเขตของข้ออ้าง

- [ONS line chart guidance](https://service-manual.ons.gov.uk/data-visualisation/chart-types/line-chart): เว้นช่องว่างเมื่อข้อมูลที่ควรต่อเนื่องหาย เป็นแนวทางออกแบบกราฟจากหน่วยงานสถิติ
- [กรมควบคุมมลพิษ](https://pcdweb.pcd.go.th/air-quality/dashboard): ระดับสี PM2.5 ในบริบทไทย; ไม่เปลี่ยนไปใช้ระดับ US AQI
- [WHO AQG table](https://www.ncbi.nlm.nih.gov/books/NBK574591/table/ch3.tab26/): แยกฐานเวลาเฉลี่ยในการแปลผล ไม่เอาเกณฑ์เฉลี่ย 24 ชั่วโมงไปกล่าวว่าเป็นเพดานของจุดรายชั่วโมง; รอบนี้ไม่เปลี่ยนค่าระดับสีเป็น WHO guideline
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): ใช้เป็นกรอบ accessibility; 12px เป็นการตัดสินใจเรื่องความอ่านง่าย ไม่ใช่ขนาดขั้นต่ำที่ WCAG บังคับ
- [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585): HTTP429 และ Retry-After; จำนวนครั้ง/ช่วงเวลาเป็นนโยบายของระบบ
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations#request-body-size): เพดาน request 4.5 MB; เลือก margin ในแอปเพื่อรองรับ multipart

ทดสอบด้วย local demo, mocked provider และ isolated test fixtures ไม่มี Google OAuth/OTP จริง, ไม่มี LINE/OCR production calls, ไม่มีการทดลองโหลดหนึ่งล้านผู้ใช้ และยังไม่ทดสอบบน Safari iPhone/Android จริง

## เปิดดู local

Preview ที่ใช้ตรวจ: `http://127.0.0.1:3279` + API `http://127.0.0.1:8179` ใช้ข้อมูล demo/test และปิด push/OCR key

หากเปิดใหม่ภายหลัง ใช้วิธี dev ปกติของโครงการ: API8000 และ Next3000 การเปลี่ยนแปลงทั้งหมดอยู่ใน working tree เพื่อให้ตรวจ diff ได้ก่อนสั่ง commit หรือ deploy
