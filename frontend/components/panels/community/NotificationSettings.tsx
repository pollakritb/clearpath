"use client";

import { useEffect, useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { T } from "@/frontend/lib/ui";
import type { NotificationPreferences } from "@/frontend/types";

const DEFAULTS: NotificationPreferences = {
  district: null,
  subdistrict: null,
  radius_km: 10,
  center_lat: null,
  center_lon: null,
  pm25_threshold: 37.5,
  air_alerts: true,
  hotspot_alerts: true,
  community_alerts: false,
  report_status_alerts: true,
  rating_alerts: true,
  reward_alerts: true,
  leaderboard_alerts: false,
  announcement_alerts: true,
};

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function NotificationSettings() {
  const auth = useAuth();
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!auth.user && !auth.localDemo) return;
    void api
      .notificationPreferences()
      .then(setPreferences)
      .catch(() => undefined);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => registration.pushManager.getSubscription())
        .then(setSubscription)
        .catch(() => undefined);
    }
  }, [auth.user, auth.localDemo]);

  async function enablePush() {
    setSaving(true);
    setError(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Browser นี้ไม่รองรับ Web Push");
      }
      const config = await api.pushConfig();
      if (!config.enabled || !config.public_key) {
        throw new Error("Server ยังไม่ได้เปิด Web Push");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("ไม่ได้รับสิทธิ์แจ้งเตือน");
      const registration = await navigator.serviceWorker.ready;
      const next =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.public_key),
        }));
      await api.subscribePush(next.toJSON());
      setSubscription(next);
      setMessage("เปิดการแจ้งเตือนแล้ว");
    } catch (cause) {
      setError(
        apiErrorMessage(
          cause,
          cause instanceof Error ? cause.message : "เปิดแจ้งเตือนไม่สำเร็จ",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function useCurrentArea() {
    setError(null);
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        setPreferences((current) => ({
          ...current,
          center_lat: position.coords.latitude,
          center_lon: position.coords.longitude,
        })),
      () => setError("ไม่สามารถอ่าน GPS สำหรับพื้นที่แจ้งเตือนได้"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  if (!auth.user && !auth.localDemo) {
    return (
      <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
        <AuthControl />
      </section>
    );
  }

  return (
    <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
      <h2 style={{ margin: "0 0 .4em", fontSize: ".95em" }}>
        การแจ้งเตือนฝุ่นและจุดความร้อน
      </h2>
      <div className="cp-notification-settings">
        <label>
          แจ้งเมื่อ PM2.5 ตั้งแต่ {preferences.pm25_threshold} µg/m³
          <input
            type="range"
            min={15}
            max={150}
            step={2.5}
            value={preferences.pm25_threshold}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                pm25_threshold: Number(event.target.value),
              }))
            }
            style={{ width: "100%" }}
          />
        </label>
        <label>
          รัศมีแจ้งเตือน {preferences.radius_km ?? 10} กม.
          <input
            type="range"
            min={1}
            max={50}
            value={preferences.radius_km ?? 10}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                radius_km: Number(event.target.value),
              }))
            }
            style={{ width: "100%" }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.air_alerts}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                air_alerts: event.target.checked,
              }))
            }
          />{" "}
          PM2.5 จาก Air4Thai
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.hotspot_alerts}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                hotspot_alerts: event.target.checked,
              }))
            }
          />{" "}
          จุดความร้อน NASA FIRMS
        </label>
        {(
          [
            ["report_status_alerts", "สถานะอนุมัติ/ปฏิเสธรายงาน"],
            ["rating_alerts", "เมื่อมีคนให้คะแนนข้อมูลของฉัน"],
            ["reward_alerts", "คะแนนและ Badge ที่ได้รับ"],
            ["leaderboard_alerts", "การเปลี่ยนอันดับประจำสัปดาห์"],
            ["announcement_alerts", "ประกาศสำคัญในชุมชน"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={preferences[key]}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />{" "}
            {label}
          </label>
        ))}
        <button type="button" onClick={useCurrentArea} className="cp-focus">
          ◎ ใช้ GPS ปัจจุบันเป็นศูนย์กลาง
        </button>
        <button
          type="button"
          disabled={saving || preferences.center_lat == null}
          onClick={() => {
            setSaving(true);
            setError(null);
            void api
              .updateNotificationPreferences(preferences)
              .then(() => setMessage("บันทึกพื้นที่และเกณฑ์แล้ว"))
              .catch((cause) =>
                setError(apiErrorMessage(cause, "บันทึกไม่สำเร็จ")),
              )
              .finally(() => setSaving(false));
          }}
          className="cp-focus"
        >
          บันทึกเกณฑ์แจ้งเตือน
        </button>
        {!subscription ? (
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={saving}
            className="cp-focus"
          >
            เปิด Web Push
          </button>
        ) : (
          <div className="cp-notification-settings__actions">
            <button
              type="button"
              onClick={() => void api.testNotification()}
              className="cp-focus"
            >
              ทดสอบ
            </button>
            <button
              type="button"
              onClick={() => {
                const endpoint = subscription.endpoint;
                void subscription
                  .unsubscribe()
                  .then(() => api.unsubscribePush(endpoint))
                  .then(() => {
                    setSubscription(null);
                    setMessage("ปิด Web Push แล้ว");
                  });
              }}
              className="cp-focus"
            >
              ปิดแจ้งเตือน
            </button>
          </div>
        )}
      </div>
      {message && (
        <p role="status" style={{ fontSize: ".7em", color: T.teal }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: ".7em", color: T.red }}>
          {error}
        </p>
      )}
    </section>
  );
}
