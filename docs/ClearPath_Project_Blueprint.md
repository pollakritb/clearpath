# ClearPath Community — Project Blueprint

เอกสารนี้แทน blueprint ระบบนำทางเดิมทั้งหมด

## Product goal

สร้างระบบพยากรณ์และเฝ้าระวัง PM2.5 ที่รวมข้อมูลทางการกับข้อมูลภาคประชาชน
โดยข้อมูลชุมชนต้องตรวจสอบย้อนกลับได้และไม่เผยแพร่ก่อน moderation

## Core contributions

1. Spatial surface: IDW ด้วย haversine
2. Explainable short-term forecast: damped local trend + uncertainty interval
3. Evidence pipeline: signed camera capture → image fingerprint → Admin value → Trust Score → peer review
4. Reputation model: ให้คะแนนผู้รายงานและผู้ช่วยตรวจจากผลตัดสินภายหลัง
5. Multi-source fusion: Air4Thai + community reports + NASA FIRMS

## Trust boundaries

- Air4Thai sync ผ่าน cron เท่านั้น; Supabase เป็น source of truth
- OpenAI OCR อ่านภาพแต่ไม่มีสิทธิ์เผยแพร่ข้อมูล
- รายงานใหม่เป็น `pending` เสมอ
- Peer vote ปรับ Trust Score ได้ในขอบเขตจำกัด
- Admin เป็นผู้เปลี่ยนสถานะเป็น `approved` หรือ `rejected`
- ภาพอยู่ใน private bucket และเข้าถึงด้วย signed URL
- Air4Thai สดใหม่ภายใน 5 กม. มาก่อน community เสมอ
- Community มีสิทธิ์เติม IDW เมื่อผ่าน Admin/Trust/freshness และมี independent corroboration ≥2 ราย
  หรือเป็น calibrated device ที่ Trust ≥80 เท่านั้น
- พิกัดจริงใช้หลังบ้าน; ตำแหน่งสาธารณะถูกเลื่อน 120–250 เมตร
- Satellite hotspot เป็นสัญญาณเฝ้าระวัง ไม่ใช่การยืนยันเหตุไฟไหม้

## Roles

- Visitor: ดูข้อมูลทางการ รายงานที่อนุมัติ ข่าว และพยากรณ์
- Member: เข้าใช้ด้วย Email OTP ส่งรายงานและช่วย peer review
- Moderator: ตรวจภาพ/OCR/Trust reasons และอนุมัติข้อมูล
- Admin: สิทธิ์ Moderator รวมถึงจัดการประกาศ/กิจกรรม

ระบบใช้ Supabase Auth/RBAC, database rate limit, audit/retention policy และ PWA Web Push แล้ว
จุดที่ยังต้องยกระดับก่อนเปิดสาธารณะคือ malware scan, device attestation, incident monitoring
และการทบทวนนโยบาย consent/retention โดยผู้รับผิดชอบข้อมูล
