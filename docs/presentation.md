# ลำดับนำเสนอ ClearPath

## เดินระบบประมาณ 10 นาที

1. เปิดแผนที่ อธิบาย Air4Thai, community reports และเวลาข้อมูล แยกค่าปัจจุบันออกจากข้อมูลก่อนหน้า
2. เลือกบริเวณ อธิบาย Place IDW และเงื่อนไขแหล่งข้อมูล ห้ามเรียก CAMS ว่า IDW หรือผลวัดจริง
3. เปิด CAMS timeline เลือกเวลา และแสดงสถานะเมื่อไม่มีข้อมูล
4. เปิดรายงานชุมชน อธิบาย public coordinates, signed image URL และ privacy
5. เปิดหน้าส่งรายงาน อธิบาย capture/draft → OCR → confirm → automatic decision โดยไม่อ้างว่า Admin อนุมัติ
6. เปิดคำขอวัดและพื้นที่ช่วยเหลือ อธิบาย ownership และงานแจ้งเตือนเบื้องหลัง
7. เปิดโปรไฟล์ แยก contribution-v3 XP ออกจาก community-trust-v1 และจาก IDW
8. เปิด Admin แบบอ่านอย่างเดียว แล้วชี้ audit/ภาพ/OCR/status ที่ตรวจได้

ถ้าข้อมูลจริงไม่พร้อม ให้แสดง unavailable ตามจริง ใช้ test fixtures เฉพาะตอนสาธิต tests ไม่เติมรายงานจำลองเข้าแอปผ่าน URL

## เดินโค้ดประมาณ 10 นาที

| ลำดับ | จุดเริ่มอ่าน                                                                    | สิ่งที่อธิบาย                                  |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1     | `app/page.tsx`, `app/layout.tsx`                                                | Routes บางและ shared shell                     |
| 2     | `frontend/hooks/useMapPage.ts`                                                  | Data orchestration และ selection               |
| 3     | `frontend/components/panels/ReportForm.tsx`, `frontend/hooks/useReportDraft.ts` | UI แยกจาก draft lifecycle                      |
| 4     | `frontend/types/index.ts`, `backend/models/schemas.py`                          | FE/BE contract ตรงกัน                          |
| 5     | `backend/routers/community.py`                                                  | HTTP/auth boundary                             |
| 6     | `backend/services/community/drafts.py`, `automatic_review.py`, `presenter.py`   | Submission, decision และ privacy แยกหน้าที่    |
| 7     | `backend/algorithms/`                                                           | Pure functions และ tests ของกติกาที่ใช้งานจริง |
| 8     | Domain stores และ `supabase_client`                                             | Persistence boundary                           |
| 9     | `backend/workers/line.py`, `.github/workflows/`                                 | งานที่ทำเมื่อไม่ได้เปิด UI                     |

## หลักฐานตรวจ

เปิดผลตรวจใน [บันทึก cleanup](cleanup.md) และอธิบาย unit/integration/browser tests โดยแยก synthetic fixtures ออกจากการใช้งาน production และผลวิจัยภายนอก

Local backend demo และ browser fixtures มีไว้ทดสอบโดยไม่ใช้บัญชี/ข้อมูลจริง การทดสอบ OCR transport ไม่ยืนยันผลอ่านภาพทุกเครื่อง และการผ่าน local SQL tests ไม่ใช่หลักฐานว่า migrations ถูก apply บน production แล้ว
