import Link from "next/link";

export default function NotFound() {
  return (
    <main className="cp-error-page">
      <h1>ไม่พบหน้าที่ต้องการ</h1>
      <p>ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่ใน ClearPath</p>
      <Link href="/">กลับหน้าแผนที่</Link>
    </main>
  );
}
