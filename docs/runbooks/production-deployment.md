# Application deployment

Deploy frontend และ FastAPI จาก Git commit เดียวบน Vercel โดย `api/index.py` เป็น backend entrypoint ตรวจ project/branch ที่ใช้งานจริงก่อน deploy ไม่ upload working tree ที่มีงานอื่นค้าง

## ก่อนส่งขึ้น

- ใช้ Node.js 22 และ Python 3.12 ตาม config/CI
- Format, lint, typecheck, unit/integration/browser tests, coverage gates, dependency audits และ production build ต้องผ่าน
- ตรวจ staged files และ secrets; `.env.local`, deploy/target credentials และ private evidence ไม่เข้า Git
- Production ต้องไม่เปิด `LOCAL_DEMO_MODE` หรือ `NEXT_PUBLIC_LOCAL_DEMO_MODE`
- รักษาค่า environment, feature flags, daemon scaling, delivery cutoff และ scheduler เดิม เว้นแต่ได้รับคำสั่งเปลี่ยนแยก

## หลัง deploy

1. รอ deployment เป็น READY และเช็ก `/api/health`
2. เช็ก `/api/ready` ให้ release ตรงกับ commit แยกสถานะข้อมูลสด/เก่าออกจากผล deploy
3. ตรวจ public read APIs และ anonymous access ของ private/Admin endpoints
4. ติดตาม Quality CI และ Production smoke; ไม่เรียก cron ที่มี side effects เพื่อใช้แทน health check
5. หาก regression มาจาก release นี้ ให้ revert commit ที่เกี่ยวข้องแล้ว deploy ตรวจซ้ำ โดยไม่ rollback ฐานข้อมูลจากการเดา

ดู [Production smoke](production-smoke.md) และ [incident response](incident-response.md)

## ฐานข้อมูลและงานส่งข้อความ

การ deploy แอปไม่ใช่การ apply SQL migrations งาน schema ต้องมี change review, backup/restore และ rollout แยกตาม [backup/restore](backup-restore.md) ห้าม rewrite migration ที่ apply ไปแล้ว

LINE ใช้ server queue/worker และ provider budgets; frontend ไม่ถือ channel/server keys ปัจจุบันไม่มี Web Push delivery runtime และไม่มีการตั้ง quiet hours ผ่าน UI ดู [LINE policy](line-notification-policy.md) และ [worker](vercel-line-daemon.md)

เครื่องมือ seed/preview และบันทึกทดลองย้อนหลังอยู่ใน [archive ภายนอก](../cleanup.md#archive-และการคืนงาน) ไม่เป็นส่วนของการ deploy ปกติ
