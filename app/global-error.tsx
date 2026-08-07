"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="th">
      <body>
        <main role="alert" className="cp-error-page">
          <h1>ClearPath ขัดข้องชั่วคราว</h1>
          <p>ยังไม่มีข้อมูลใดถูกส่ง กรุณาลองเปิดแอปใหม่</p>
          <button type="button" onClick={reset}>
            เปิดใหม่
          </button>
        </main>
      </body>
    </html>
  );
}
