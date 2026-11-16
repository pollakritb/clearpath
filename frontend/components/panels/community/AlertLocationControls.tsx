"use client";

import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import type { AlertLocationStatus } from "@/frontend/types";
import { ALERT_LOCATION_CHANGED } from "@/frontend/components/auth/AlertLocationPresence";

/** Status only: foreground sampling and expiry cleanup are automatic. */
export default function AlertLocationControls({
  enabled,
}: {
  enabled: boolean;
}) {
  const [location, setLocation] = useState<AlertLocationStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let latestRead = 0;
    const load = () => {
      const read = ++latestRead;
      void api.alertLocation().then(
        (value) => {
          if (active && read === latestRead) {
            setLocation(value);
            setUnavailable(false);
          }
        },
        () => {
          if (active && read === latestRead) setUnavailable(true);
        },
      );
    };
    const visible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    window.addEventListener(ALERT_LOCATION_CHANGED, load);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(ALERT_LOCATION_CHANGED, load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
  const stale =
    location?.observed_at && now - Date.parse(location.observed_at) >= 86400000;
  return (
    <section
      aria-label="ตำแหน่งสำหรับแจ้งค่าฝุ่น"
      className="cp-alert-location"
    >
      <strong>ตำแหน่งแจ้งเตือน</strong>
      <p role="status">
        {!enabled
          ? "ปิดแจ้งเตือนค่าฝุ่นอยู่"
          : unavailable
            ? "ตรวจสถานะตำแหน่งไม่ได้ชั่วคราว"
            : !location
              ? "กำลังตรวจตำแหน่ง…"
              : location.status === "ready" && !stale
                ? "พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน"
                : "รอตำแหน่งล่าสุดจากเบราว์เซอร์"}
      </p>
      {enabled && (
        <small>
          อัปเดตอัตโนมัติเมื่ออนุญาตตำแหน่ง · ใช้พิกัดล่าสุดไม่เกิน 24 ชั่วโมง
        </small>
      )}
    </section>
  );
}
