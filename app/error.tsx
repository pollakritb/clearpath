"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("clearpath_route_error", { digest: error.digest });
  }, [error]);

  return (
    <main role="alert" className="cp-error-page">
      <h1>เปิดหน้านี้ไม่สำเร็จ</h1>
      <p>ข้อมูลของคุณยังไม่ถูกส่ง กรุณาลองโหลดส่วนนี้ใหม่</p>
      <button type="button" onClick={reset}>
        ลองอีกครั้ง
      </button>
    </main>
  );
}
