"use client";

import { useEffect, useMemo, useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { NotificationPreferences } from "@/frontend/types";

import LineNotificationCard from "./LineNotificationCard";

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

const ALERT_OPTIONS = [
  ["air_alerts", "PM2.5 จาก Air4Thai", "ข้อมูลหลักจากสถานีทางการ"],
  ["hotspot_alerts", "จุดความร้อนดาวเทียม", "NASA FIRMS อายุไม่เกิน 12 ชม."],
  ["report_status_alerts", "สถานะรายงานของฉัน", "อนุมัติ ปฏิเสธ หรือรอตรวจ"],
  ["rating_alerts", "คำขอบคุณจากชุมชน", "เมื่อมีคนขอบคุณข้อมูลของฉัน"],
  ["reward_alerts", "คะแนนและเหรียญ", "รางวัลจากการช่วยชุมชน"],
  ["leaderboard_alerts", "อันดับประจำสัปดาห์", "เมื่ออันดับของฉันเปลี่ยน"],
  ["announcement_alerts", "ประกาศสำคัญ", "ข่าวสารที่ควรรู้จาก ClearPath"],
] as const;

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
  const [editingConditions, setEditingConditions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );

  useEffect(() => {
    if ("Notification" in window) {
      queueMicrotask(() => setPermission(Notification.permission));
    }
    if (!auth.user && !auth.localDemo) return;
    void api
      .notificationPreferences()
      .then(setPreferences)
      .catch(() => undefined);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then(setSubscription)
        .catch(() => undefined);
    }
  }, [auth.user, auth.localDemo]);

  const activeAlertCount = useMemo(
    () => ALERT_OPTIONS.filter(([key]) => preferences[key]).length,
    [preferences],
  );

  async function enablePush() {
    setSaving(true);
    setError(null);
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        throw new Error("Browser นี้ไม่รองรับ Web Push");
      }
      const config = await api.pushConfig();
      if (!config.enabled || !config.public_key) {
        throw new Error("Server ยังไม่ได้เปิด Web Push");
      }
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        throw new Error(
          nextPermission === "denied"
            ? "เบราว์เซอร์บล็อกการแจ้งเตือน กรุณาเปิดสิทธิ์ใน Settings"
            : "ยังไม่ได้รับสิทธิ์แจ้งเตือน",
        );
      }
      const registration = await navigator.serviceWorker.ready;
      const next =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.public_key),
        }));
      await api.subscribePush(next.toJSON());
      setSubscription(next);
      setMessage("เปิด Web Push แล้ว");
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

  function useCurrentArea() {
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

  async function savePreferences() {
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPreferences(preferences);
      setMessage("บันทึกเงื่อนไขแจ้งเตือนแล้ว");
      setEditingConditions(false);
    } catch (cause) {
      setError(apiErrorMessage(cause, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function testPush() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.testNotification();
      setMessage(result.message);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ทดสอบแจ้งเตือนไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function disablePush() {
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await api.unsubscribePush(endpoint);
    setSubscription(null);
    setMessage("ปิด Web Push แล้ว");
  }

  if (!auth.user && !auth.localDemo) {
    return (
      <section className="cp-notification-auth">
        <p>เข้าสู่ระบบเพื่อบันทึกช่องทางและเงื่อนไขแจ้งเตือนของคุณ</p>
        <AuthControl />
      </section>
    );
  }

  return (
    <section
      className="cp-notification-settings"
      aria-labelledby="notification-settings-title"
    >
      <header className="cp-notification-settings__intro">
        <span aria-hidden="true">
          <AppIcon name="alert" size={22} />
        </span>
        <div>
          <h2 id="notification-settings-title">รับเฉพาะเรื่องที่สำคัญ</h2>
          <p>เลือกช่องทางก่อน แล้วกำหนดระดับฝุ่นและพื้นที่ด้านล่าง</p>
        </div>
      </header>

      <div className="cp-notification-section-heading">
        <div>
          <small>ขั้นตอนที่ 1</small>
          <h3>ช่องทางรับแจ้งเตือน</h3>
        </div>
        <span>เลือกได้มากกว่า 1 ช่องทาง</span>
      </div>

      <LineNotificationCard />

      <section
        className="cp-push-channel"
        aria-labelledby="web-push-channel-title"
      >
        <header>
          <span className="cp-push-channel__icon" aria-hidden="true">
            <AppIcon name="alert" size={22} />
          </span>
          <span className="cp-push-channel__copy">
            <h3 id="web-push-channel-title">Web Push</h3>
            <small>แจ้งเตือนบนอุปกรณ์เครื่องนี้</small>
          </span>
          <span
            className="cp-channel-status"
            data-active={subscription !== null}
          >
            {subscription ? "เปิดแล้ว" : "ยังไม่เปิด"}
          </span>
        </header>

        {!subscription ? (
          <>
            <p className="cp-push-channel__hint">
              iPhone/iPad ต้องเพิ่ม ClearPath ไปที่หน้าจอโฮม
              แล้วเปิดจากไอคอนนั้น
            </p>
            <button
              type="button"
              onClick={() => void enablePush()}
              disabled={saving}
              className="cp-focus cp-channel-button cp-channel-button--secondary"
            >
              เปิด Web Push
            </button>
          </>
        ) : (
          <div className="cp-push-channel__actions">
            <button
              type="button"
              onClick={() => void testPush()}
              disabled={saving}
              className="cp-focus cp-channel-button cp-channel-button--secondary"
            >
              ส่งข้อความทดสอบ
            </button>
            <button
              type="button"
              onClick={() => void disablePush()}
              disabled={saving}
              className="cp-focus cp-channel-button cp-channel-button--quiet"
            >
              ปิด Web Push
            </button>
          </div>
        )}
      </section>

      <div className="cp-notification-section-heading">
        <div>
          <small>ขั้นตอนที่ 2</small>
          <h3>เงื่อนไขแจ้งเตือน</h3>
        </div>
        <span>ใช้ร่วมกันทุกช่องทาง</span>
      </div>

      <section className="cp-notification-conditions">
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="activity" size={19} />
          </span>
          <span>
            <small>ระดับฝุ่น</small>
            <strong>PM2.5 ตั้งแต่ {preferences.pm25_threshold} µg/m³</strong>
          </span>
        </div>
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="location" size={19} />
          </span>
          <span>
            <small>พื้นที่</small>
            <strong>
              {preferences.center_lat == null
                ? "ยังไม่ได้เลือกศูนย์กลาง"
                : `ภายใน ${preferences.radius_km ?? 10} กม.`}
            </strong>
          </span>
        </div>
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="settings" size={19} />
          </span>
          <span>
            <small>ประเภทเหตุการณ์</small>
            <strong>เปิดอยู่ {activeAlertCount} รายการ</strong>
          </span>
        </div>

        <button
          type="button"
          className="cp-focus cp-notification-conditions__toggle"
          aria-expanded={editingConditions}
          aria-controls="notification-condition-editor"
          onClick={() => setEditingConditions((current) => !current)}
        >
          <AppIcon name={editingConditions ? "close" : "settings"} size={17} />
          {editingConditions ? "ปิดการแก้ไข" : "แก้ไขเงื่อนไข"}
        </button>

        {editingConditions && (
          <div
            id="notification-condition-editor"
            className="cp-notification-condition-editor"
          >
            <fieldset className="cp-notification-range-group">
              <legend>ระดับและพื้นที่</legend>
              <label>
                <span>
                  แจ้งเมื่อ PM2.5 ถึง
                  <output>{preferences.pm25_threshold} µg/m³</output>
                </span>
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
                />
              </label>
              <label>
                <span>
                  รัศมีแจ้งเตือน
                  <output>{preferences.radius_km ?? 10} กม.</output>
                </span>
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
                />
              </label>
              <button
                type="button"
                onClick={useCurrentArea}
                className="cp-focus cp-location-button"
              >
                <AppIcon name="location" size={17} />
                {preferences.center_lat == null
                  ? "ใช้ตำแหน่งปัจจุบัน"
                  : "อัปเดตตำแหน่งปัจจุบัน"}
              </button>
            </fieldset>

            <fieldset className="cp-notification-option-group">
              <legend>เลือกประเภทเหตุการณ์</legend>
              {ALERT_OPTIONS.map(([key, label, description]) => (
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
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <button
              type="button"
              disabled={saving || preferences.center_lat == null}
              onClick={() => void savePreferences()}
              className="cp-focus cp-notification-save"
            >
              <AppIcon name="check" size={18} />
              บันทึกเงื่อนไข
            </button>
            {preferences.center_lat == null && (
              <small className="cp-notification-save-hint">
                เลือกตำแหน่งปัจจุบันก่อนบันทึก เพื่อกำหนดพื้นที่แจ้งเตือน
              </small>
            )}
          </div>
        )}
      </section>

      <div className="cp-notification-feedback" aria-live="polite">
        {permission === "denied" && (
          <p role="alert" data-kind="error">
            สิทธิ์แจ้งเตือนถูกบล็อกอยู่ ต้องเปิดใน Settings ของอุปกรณ์ก่อน
          </p>
        )}
        {message && (
          <p role="status" data-kind="success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" data-kind="error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
