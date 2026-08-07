import Link from "next/link";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f7f6",
        color: "#173a37",
      }}
    >
      <section style={{ maxWidth: 420, textAlign: "center" }}>
        <p aria-hidden="true" style={{ fontSize: 48, margin: 0 }}>
          ◌
        </p>
        <h1>ขณะนี้ไม่ได้เชื่อมต่ออินเทอร์เน็ต</h1>
        <p>
          ข้อมูลคุณภาพอากาศต้องเชื่อมต่อเครือข่ายเพื่อยืนยันเวลาและความสดของข้อมูล
          ระบบจะไม่แสดงค่าที่บันทึกไว้ว่ายังเป็นข้อมูลล่าสุด
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            minHeight: 48,
            alignItems: "center",
            padding: "0 22px",
            borderRadius: 16,
            background: "#0b766f",
            color: "white",
            textDecoration: "none",
          }}
        >
          ลองเชื่อมต่ออีกครั้ง
        </Link>
      </section>
    </main>
  );
}
