"use client";

import { useEffect, useState } from "react";

export default function HotspotObservationTime({ value }: { value: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const observed = new Date(value);
  if (!Number.isFinite(observed.getTime())) return null;
  const minutes = Math.max(0, Math.floor((now - observed.getTime()) / 60_000));
  const age =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`
      : `${minutes} นาที`;
  return (
    <p className="cp-hotspot-time">
      <strong>{`ตรวจพบ ${age}ที่แล้ว`}</strong>
      <time dateTime={value}>
        {observed.toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}{" "}
        · เวลาไทย
      </time>
    </p>
  );
}
