# ClearPath presentation screenshots — refreshed 16 October 2026

ชุดภาพหน้าจอมือถือขนาด 390 × 844 px สำหรับใช้ในสไลด์นำเสนอ ClearPath

ภาพถูกสร้างจาก automated presentation flow ใน test environment เพื่อทดสอบหน้าจอและ interaction โดยไม่เพิ่มข้อมูลตัวอย่างลง Production ภาพรายงานผู้ใช้และผล OCR ในชุดนี้ใช้ข้อมูลจำลอง ไม่ใช่หลักฐานการส่งรายงานจริง

## ภาพทั้งหมด

| ไฟล์                                 | เนื้อหา                                          |
| ------------------------------------ | ------------------------------------------------ |
| `01-map-current-overview.png`        | ภาพรวมแผนที่และค่าฝุ่นปัจจุบัน                   |
| `02-map-layer-types.png`             | ตัวกรองประเภทหมุดบนแผนที่                        |
| `03-official-station-detail.png`     | รายละเอียดหมุดสถานีตรวจวัดทางการ                 |
| `04-user-report-detail.png`          | รายละเอียดหมุดผู้รายงานที่เปิดเผยตัวตนและโปรไฟล์ |
| `05-user-report-comments.png`        | Like, Dislike และความคิดเห็นต่อรายงานผู้ใช้      |
| `06-today-current-air.png`           | หน้าวันนี้และค่าฝุ่นใกล้ตำแหน่งผู้ใช้            |
| `07-forecast-24-hours.png`           | UI พยากรณ์ล่วงหน้า 24 ชั่วโมงจาก CAMS/Open-Meteo |
| `08-forecast-method-detail.png`      | รายละเอียดแหล่งข้อมูลและวิธีคำนวณพยากรณ์         |
| `09-report-start.png`                | หน้าเริ่มส่งรายงานค่าฝุ่น                        |
| `10-report-live-camera.png`          | กล้องสดและปุ่มสลับกล้อง                          |
| `11-report-photo-and-gps.png`        | ภาพที่ถ่ายและการยืนยัน GPS                       |
| `12-report-ocr-review.png`           | ผล OCR และหน้าตรวจทานก่อนส่ง                     |
| `13-report-submitted.png`            | ผลลัพธ์หลังส่งรายงานสำเร็จ                       |
| `14-news-and-announcements.png`      | ข่าวสารและประกาศ                                 |
| `15-profile-and-leaderboard.png`     | โปรไฟล์ ผลงาน และ Leaderboard                    |
| `16-settings-and-google-account.png` | การตั้งค่าและบัญชี Google                        |
| `17-notification-channels.png`       | การแจ้งเตือน LINE/Web Push                       |
| `18-admin-overview.png`              | ภาพรวมศูนย์ควบคุมผู้ดูแล                         |
| `19-admin-ocr-exceptions.png`        | ประวัติรายงานสำหรับผู้ดูแล (ชื่อไฟล์เดิม)        |
| `20-admin-announcements.png`         | จัดการประกาศสำหรับผู้ดูแล                        |
| `21-admin-system-health.png`         | สุขภาพระบบและสถานะการ sync ข้อมูล                |

## ชุดที่แนะนำสำหรับสไลด์หลัก

ใช้ `01`, `03`, `04`, `06`, `07`, `10`, `12`, `13`, `14`, `15` และ `18` เพื่อเล่าเส้นทางตั้งแต่ดูข้อมูลบนแผนที่ ไปจนถึงส่งรายงานด้วยกล้องและการดูแลระบบ

## การสร้างภาพซ้ำ

```powershell
npx.cmd playwright test e2e/presentation-screenshots.spec.ts --project=mobile-390
```

ชุดทดสอบภาพนี้ผ่าน 6 tests บน viewport 390 × 844 px เมื่อ 16 ตุลาคม 2026
