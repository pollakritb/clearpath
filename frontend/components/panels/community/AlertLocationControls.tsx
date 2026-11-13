"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { AlertLocationStatus } from "@/frontend/types";
import { ALERT_LOCATION_CHANGED } from "@/frontend/components/auth/AlertLocationPresence";

export default function AlertLocationControls({
  enabled,
}: {
  enabled: boolean;
}) {
  const [location, setLocation] = useState<AlertLocationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    active.current = true;
    const requestGeneration = generation;
    ++requestGeneration.current;
    let latestRead = 0;
    let cancelled = false;
    const load = () => {
      const cycle = requestGeneration.current;
      const read = ++latestRead;
      void api
        .alertLocation()
        .then((value) => {
          if (
            !cancelled &&
            read === latestRead &&
            cycle === requestGeneration.current
          ) {
            setBusy(false);
            setLocation(value);
            setError(null);
          }
        })
        .catch(() => {
          if (
            !cancelled &&
            read === latestRead &&
            cycle === requestGeneration.current
          )
            setError("โหลดตำแหน่งแจ้งเตือนไม่สำเร็จ ลองอัปเดตตำแหน่งอีกครั้ง");
        });
    };
    load();
    window.addEventListener(ALERT_LOCATION_CHANGED, load);
    return () => {
      cancelled = true;
      active.current = false;
      requestGeneration.current++;
      window.removeEventListener(ALERT_LOCATION_CHANGED, load);
    };
  }, [enabled]);
  function update() {
    setError(null);
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS");
      return;
    }
    setBusy(true);
    const current = ++generation.current;
    const valid = () => active.current && current === generation.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!valid()) return;
        if (position.coords.accuracy > 200) {
          setError(
            "ตำแหน่งยังไม่แม่นยำพอ กรุณาเปิดตำแหน่งแบบแม่นยำแล้วลองอีกครั้ง",
          );
          setBusy(false);
          return;
        }
        void api
          .updateAlertLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
            observed_at: new Date(position.timestamp).toISOString(),
          })
          .then((value) => {
            if (valid()) setLocation(value);
          })
          .catch((cause) => {
            if (valid())
              setError(apiErrorMessage(cause, "บันทึกตำแหน่งไม่สำเร็จ"));
          })
          .finally(() => {
            if (valid()) setBusy(false);
          });
      },
      (cause) => {
        if (valid()) {
          setBusy(false);
          setError(
            cause.code === 1
              ? "ยังไม่ได้อนุญาตตำแหน่ง เปิดสิทธิ์ในเบราว์เซอร์แล้วลองอีกครั้ง"
              : "อ่าน GPS ไม่สำเร็จ กรุณาลองอีกครั้ง",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }
  async function clear() {
    setBusy(true);
    setError(null);
    generation.current++;
    try {
      await api.clearAlertLocation();
      if (active.current)
        setLocation({
          status: "missing",
          observed_at: null,
          accuracy_m: null,
          version: null,
        });
    } catch (cause) {
      if (active.current)
        setError(apiErrorMessage(cause, "ลบตำแหน่งไม่สำเร็จ"));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const stale =
    location?.observed_at && now - Date.parse(location.observed_at) > 86400000;
  return (
    <section
      aria-label="ตำแหน่งสำหรับแจ้งค่าฝุ่น"
      className="cp-alert-location"
    >
      <strong>ตำแหน่งใช้งานล่าสุด</strong>
      <p role="status">
        {!enabled
          ? "บันทึกความยินยอมและเปิดแจ้ง PM2.5 ก่อนใช้ตำแหน่ง"
          : !location
            ? "กำลังตรวจตำแหน่ง…"
            : location.status === "ready" && !stale
              ? "พร้อมใช้ค้นหาหมุดใกล้คุณ"
              : location.status === "stale" || stale
                ? "ตำแหน่งหมดอายุ กรุณาอัปเดต GPS"
                : "ยังไม่มีตำแหน่งสำหรับแจ้งค่าฝุ่น"}
      </p>
      {location?.observed_at && (
        <p>
          อ่าน GPS เมื่อ{" "}
          {new Date(location.observed_at).toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
      <p>ใช้ค่าจากหมุดสถานีหรือรายงานชุมชนที่ใกล้ GPS ล่าสุดที่สุด</p>
      <details>
        <summary>วิธีใช้ตำแหน่งและเลือกหมุด</summary>
        <p>
          อัปเดตเมื่อกลับมาใช้เว็บและอนุญาต GPS แล้ว ตำแหน่งใช้ได้ 24 ชั่วโมง
          ไม่ติดตามเมื่อปิดเว็บ
        </p>
        <p>
          เลือกหมุดใกล้ที่สุดในระยะที่ตั้งไว้ก่อนตรวจระดับฝุ่น
          ใช้สถานีอายุไม่เกิน 1 ชั่วโมง หรือรายงานชุมชนที่เผยแพร่แล้วอายุไม่เกิน
          3 ชั่วโมง หากไม่มีหมุดสดจะไม่แจ้งเตือน
        </p>
      </details>
      <button
        type="button"
        className="cp-focus cp-location-button"
        disabled={!enabled || busy}
        onClick={update}
      >
        {busy ? "กำลังดำเนินการ…" : "อัปเดตตำแหน่งแจ้งเตือน"}
      </button>
      {location?.observed_at && (
        <button
          type="button"
          className="cp-focus cp-btn"
          disabled={busy}
          onClick={() => void clear()}
        >
          ลบตำแหน่งแจ้งเตือน
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
