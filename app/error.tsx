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
      <p>
        โหลดส่วนนี้ไม่สำเร็จ กรุณาลองใหม่ หากเพิ่งส่งรายงาน
        ให้ตรวจประวัติก่อนส่งซ้ำ
      </p>
      <button type="button" onClick={reset}>
        ลองอีกครั้ง
      </button>
    </main>
  );
}
