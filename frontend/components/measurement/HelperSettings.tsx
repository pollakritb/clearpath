"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { MeasurementHelperSettings } from "@/frontend/types";
import {
  HELPER_SETTINGS_CHANGED,
  HELPER_PRESENCE_UPDATED,
} from "./HelperPresence";

export default function HelperSettings() {
  const auth = useAuth();
  const login = useLoginPrompt();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const account = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  const [loaded, setLoaded] = useState<{
    account: string;
    settings: MeasurementHelperSettings;
  } | null>(null);
  const settings = loaded?.account === account ? loaded.settings : null;
  const setSettings = (settings: MeasurementHelperSettings) =>
    setLoaded({ account, settings });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!signedIn) return;
      void api
        .measurementHelper()
        .then((r) => {
          if (active) setLoaded({ account, settings: r });
        })
        .catch((e) => {
          if (active)
            setError(apiErrorMessage(e, "โหลดการตั้งค่าผู้ช่วยไม่สำเร็จ"));
        });
    };
    refresh();
    window.addEventListener(HELPER_PRESENCE_UPDATED, refresh);
    return () => {
      active = false;
      window.removeEventListener(HELPER_PRESENCE_UPDATED, refresh);
    };
  }, [signedIn, account]);
  async function toggle() {
    if (login.openLoginPrompt()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.setMeasurementHelper(!settings?.enabled);
      setSettings(result);
      window.dispatchEvent(new Event(HELPER_SETTINGS_CHANGED));
    } catch (e) {
      setError(apiErrorMessage(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cp-measure-card">
      <h3>ช่วยวัดค่าฝุ่นให้ชุมชน</h3>
      <p>
        รับคำขอใกล้ตำแหน่งเข้าเว็บล่าสุด เก็บเฉพาะ GPS
        ล่าสุดเมื่อเปิดหรือกลับมาใช้เว็บ ไม่ติดตามเบื้องหลัง และอาจได้รับ LINE
        แม้ปิดเว็บแล้ว
      </p>
      <label className="cp-measure-toggle">
        <input
          type="checkbox"
          checked={settings?.enabled ?? false}
          disabled={busy || ((!!auth.user || auth.localDemo) && !settings)}
          onChange={() => void toggle()}
        />
        รับคำขอช่วยวัดใกล้ตำแหน่งเข้าเว็บล่าสุด
      </label>
      {settings?.enabled && (
        <p>
          {settings.observed_at
            ? `ตำแหน่งล่าสุด ${new Date(settings.observed_at).toLocaleString("th-TH")}`
            : "เปิดแล้ว กำลังขอ GPS จากอุปกรณ์ หากไม่มีสิทธิ์ให้อนุญาตตำแหน่งในการตั้งค่าเบราว์เซอร์"}
        </p>
      )}
      <small>
        ปิดแล้วลบพิกัดที่ใช้จับคู่และหยุดแจ้งคำขอที่ยังไม่ส่ง · LINE
        ใช้การเชื่อมบัญชีและเวลาพักจากการตั้งค่าเดิม
      </small>
      <Link href="/requests" className="cp-measure-link">
        ดูคำขอของฉันและคำขอให้ช่วยวัด
      </Link>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
