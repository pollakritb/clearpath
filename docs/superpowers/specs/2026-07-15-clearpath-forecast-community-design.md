# ClearPath Forecast & Community — Design Spec

> สถานะ: แนวทางหลักตั้งแต่ 2026-07-15 · supersedes route-planner design

## Scope

- Official PM2.5: Air4Thai → hourly cron → Supabase
- Forecast: 1–24 ชั่วโมงต่อสถานี พร้อม uncertainty
- Fire layer: NASA FIRMS พร้อม acquisition time/confidence และแจ้งเตือนเฉพาะ hotspot ≤12 ชั่วโมง
- Community evidence: `getUserMedia` camera, server-signed 5-minute session, GPS, private image
- Explainable Trust Score + reputation-weighted peer review
- Admin approval before publication
- Community announcements, activities, rewards and leaderboard

ระบบนำทาง, ORS, Nominatim, route comparison และ route speech อยู่นอก scope และถูกถอดออก

## Publication state machine

```text
camera + GPS → pending (no public PM2.5)
                    ├─ Admin reads image + enters PM2.5 → approved → map → nearby peer review
                    └─ Admin reject                         → rejected
```

Peer review ไม่สามารถเผยแพร่รายงานเองได้ เปิดหลัง Admin อนุมัติ และผู้ตรวจต้องส่ง GPS
ที่อยู่ภายใน 3 กม. ขณะที่รายงานมีอายุไม่เกิน 3 ชั่วโมง ทุกผลตรวจต้องมี reason code
และห้ามตรวจรายงานของตนเอง

## Official vs Community

- Air4Thai ที่สดใหม่ไม่เกิน 1 ชั่วโมงภายใน 5 กม. เป็นข้อมูลหลัก Community Report แสดงเป็น `supplementary`
- หากไม่มี Air4Thai สดใหม่ภายใน 5 กม. รายงานที่ approved, อายุ ≤3 ชั่วโมง และ Trust ≥60 เป็นผู้สมัคร `gap_fill`
- ผู้สมัครเข้า IDW ได้เมื่อมีรายงานที่เข้ากันได้จากผู้ใช้คนละคน ≥2 คน ภายใน 2 กม./60 นาที หรือ Trust ≥80 พร้อม calibrated device
- GPS accuracy ต้อง ≤200 เมตร และรายงานจากแหล่งกำเนิดโดยตรง/ภาพซ้ำไม่มีสิทธิ์เข้า IDW
- IDW ใช้สถานี Air4Thai ทั้งหมดร่วมกับ `gap_fill` ที่ eligible เท่านั้น ไม่ใช้ supplementary แทนค่าทางการ
- ความต่างสูงไม่ถูกซ่อน เพื่อให้เห็น local anomaly แต่ต้องแสดงแหล่งข้อมูลและ Trust ชัดเจน

ค่า PM2.5 ถือว่าเข้ากันได้เมื่อส่วนต่างไม่เกินค่าที่มากกว่าระหว่าง 10 µg/m³ หรือ 25%
ของค่าที่สูงกว่า เกณฑ์นี้เป็นกติกา MVP ที่ต้องประเมินกับข้อมูลภาคสนามภายหลัง

## Trust Score v1

| Signal                                  | คะแนนสูงสุด |
| --------------------------------------- | ----------: |
| Admin reads image and verifies value    |          25 |
| signed in-app camera session            |          15 |
| capture freshness                       |          10 |
| GPS within Nakhon Pathom service area   |          10 |
| outdoor and stable measurement protocol |          10 |
| optional device/display detection       |           5 |
| agreement with nearby official station  |          15 |
| reporter reputation                     |          10 |

OCR เป็นข้อมูลช่วยอ่านและไม่ให้คะแนนหลักใน MVP; Admin เป็นผู้กรอกค่าที่เผยแพร่
Peer review ปรับเพิ่ม/ลดได้ไม่เกิน 8 คะแนน คะแนนทุกส่วนเก็บเหตุผลเพื่อให้ตรวจสอบได้
GPS accuracy >200 เมตรและภาพ perceptually similar ถูกหักคะแนน ส่วน exact duplicate ถูกปฏิเสธ

## Privacy and abuse controls

- เก็บพิกัดจริงเฉพาะงาน moderation/quality computation; API สาธารณะเลื่อนพิกัดแบบ stable 120–250 เมตร
- ตรวจไฟล์ภาพด้วย Pillow, จำกัด 25 ล้านพิกเซล, เก็บ SHA-256 และ 8×8 average hash
- exact duplicate ถูกปฏิเสธ; perceptual distance ≤4 ถูกทำเครื่องหมายและหัก Trust
- จำกัดส่ง 6 รายงาน/ผู้ใช้/24 ชั่วโมง และให้แต้ม peer review สูงสุด 5 ครั้ง/24 ชั่วโมง
- ตำแหน่ง Admin แสดง GPS accuracy เพื่อช่วยตัดสินหลักฐาน

## Forecast v1

Baseline ใช้ median hourly slope, จำกัด outlier trend, damp แนวโน้ม และช่วงคาดการณ์จาก
residual MAD ส่วน candidate XGBoost เป็น direct horizon 1/3/6/12/24 ชั่วโมง train แบบ offline
จาก PM2.5 lag, weather และ wind-aware FIRMS features แล้ว export เป็น neutral JSON เพื่อไม่ deploy
`xgboost` บน Vercel โมเดล activate เฉพาะเมื่อผ่าน data/completeness/MAE/category gate; ทุกกรณี
ที่ artifact หรือ feature ไม่ครบต้อง fallback baseline พร้อมเหตุผล

## Security requirements

- service-role/OpenAI/VAPID private/cron secrets อยู่ backend เท่านั้น
- สมาชิกใช้ Supabase Email OTP; moderator/admin ตรวจจาก `profiles.role`
- ภาพไม่ public; ออก signed URL อายุสั้น
- จำกัด JPEG/PNG/WEBP ไม่เกิน 8 MB
- ไม่แสดง file picker; browser ใช้ `getUserMedia` และ server timestamp ที่ลงนาม
- ภาพเหมือนเดิมส่งซ้ำไม่ได้ และ image dimensions ถูกตรวจเพื่อป้องกัน decompression bomb
- OpenAI request ใช้ `store=false` และ structured JSON output
- production มี auth, distributed rate limiting, audit trail และ retention cleanup แล้ว;
  malware scanning/device attestation เป็น hardening ลำดับถัดไป
