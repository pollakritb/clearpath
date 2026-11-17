# Measurement requests

ผู้ใช้เลือกพื้นที่บนแผนที่หรือเปิด `/requests` เพื่อขอให้ชุมชนช่วยวัด เลือกเวลาที่ต้องการ ติดตามสถานะ และยกเลิกคำขอของตน ผู้ช่วยเลือกคำขอและส่งรายงานจากบริบทของคำขอนั้นได้

## เส้นทางโค้ด

- Frontend: request pages/components และ `useMeasurementRequests`
- Backend: measurement router → `services/measurement` → pure matching/eligibility policies และ stores
- `GET /api/cron/measurement-requests` เป็น protected server job สำหรับการประมวลผลอัตโนมัติ ไม่ใช่ Admin mutation
- LINE invitations ต้องผ่าน helper participation, ownership/eligibility, consent และ current delivery policy; ไม่เชิญผู้ส่งคำขอให้ตอบคำขอตนเอง
- ทุก API ตรวจ ownership ฝั่ง server รหัสที่ frontend ถือเป็น strings

## การทดสอบ

```sh
.venv/bin/python -m pytest backend/tests/test_measurement_requests.py backend/tests/test_registered_measurements.py
node scripts/test-registered-measurements.mjs
npx playwright test e2e/request-flow.spec.ts
```

Local backend demo อยู่ใน memory และไม่ส่งข้อความ production เครื่องมือ local scheduler/ตรวจ migration รุ่นเก่าถูกย้ายไป archive แล้ว Current browser fixtures อยู่ใน `e2e/fixtures` และ SQL rehearsals ใช้ isolated PostgreSQL/PGlite

การเปิด feature/worker บน production และการ apply migrations เป็นงาน rollout แยกจาก cleanup ดู [LINE policy](line-notification-policy.md), [helper areas](helper-area-onboarding.md) และ [backup/restore](backup-restore.md)
