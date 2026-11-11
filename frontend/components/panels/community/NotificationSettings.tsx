"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { NotificationPreferences } from "@/frontend/types";

import LineNotificationCard from "./LineNotificationCard";

const DEFAULTS: NotificationPreferences = {
  line_enabled: true,
  district: null,
  subdistrict: null,
  radius_km: 10,
  center_lat: null,
  center_lon: null,
  pm25_threshold: 37.6,
  air_alerts: true,
  hotspot_alerts: true,
  community_alerts: false,
  report_status_alerts: true,
  rating_alerts: true,
  reward_alerts: true,
  leaderboard_alerts: false,
  announcement_alerts: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  timezone: "Asia/Bangkok",
  consent_granted: false,
  consent_granted_at: null,
};

const ALERT_OPTIONS = [
  [
    "air_alerts",
    "PM2.5 ถึงหรือเกินค่าที่ตั้งไว้",
    "ข้อมูลจาก Air4Thai ภายในพื้นที่และรัศมีที่เลือก",
  ],
] as const;

export default function NotificationSettings() {
  const auth = useAuth();
  return (
    <NotificationSettingsContent
      key={auth.user?.id ?? (auth.localDemo ? "local" : "guest")}
    />
  );
}

function NotificationSettingsContent() {
  const auth = useAuth();
  const loginPrompt = useLoginPrompt();
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [persisted, setPersisted] = useState<NotificationPreferences | null>(
    null,
  );
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [reload, setReload] = useState(0);
  const [editingConditions, setEditingConditions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!auth.user && !auth.localDemo) return;
    let active = true;
    void api
      .notificationPreferences()
      .then((value) => {
        if (!active) return;
        const effective = {
          ...value,
          pm25_threshold: Math.max(37.6, value.pm25_threshold),
        };
        setPreferences(effective);
        setPersisted(effective);
        setLoadState("ready");
        setError(null);
      })
      .catch(() => {
        if (active) {
          setLoadState("error");
          setError(
            "โหลดเงื่อนไขแจ้งเตือนไม่สำเร็จ ค่าที่บันทึกไว้ยังไม่เปลี่ยน",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [auth.user, auth.localDemo, reload]);

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
    if (!persisted || loadState !== "ready" || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPreferences(preferences);
      setPersisted({ ...preferences });
      setMessage("บันทึกเงื่อนไขแจ้งเตือนแล้ว");
      setEditingConditions(false);
    } catch (cause) {
      setError(apiErrorMessage(cause, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  if (!auth.user && !auth.localDemo) {
    return (
      <section className="cp-notification-auth">
        <p>เข้าสู่ระบบเพื่อบันทึกช่องทางและเงื่อนไขแจ้งเตือนของคุณ</p>
        <button
          type="button"
          className="cp-auth-redirect__button cp-focus"
          onClick={() =>
            loginPrompt.openLoginPrompt({
              title: "เข้าสู่ระบบเพื่อเปิดการแจ้งเตือน",
              description:
                "บันทึกช่องทาง ระดับฝุ่น และพื้นที่แจ้งเตือนไว้กับบัญชี Google ของคุณ",
            })
          }
        >
          เข้าสู่ระบบด้วย Google
        </button>
      </section>
    );
  }

  if (loadState !== "ready")
    return (
      <section aria-label="ช่องทางและเงื่อนไขแจ้งเตือน">
        {loadState === "loading" ? (
          <p role="status">กำลังโหลดเงื่อนไขแจ้งเตือน…</p>
        ) : (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="cp-focus cp-btn"
              onClick={() => {
                setLoadState("loading");
                setReload((n) => n + 1);
              }}
            >
              ลองโหลดเงื่อนไขใหม่
            </button>
          </div>
        )}
      </section>
    );

  return (
    <section
      className="cp-notification-settings"
      aria-label="ช่องทางและเงื่อนไขแจ้งเตือน"
    >
      <div className="cp-notification-section-heading">
        <h3>ช่องทางรับแจ้งเตือน</h3>
      </div>

      <LineNotificationCard />

      <div className="cp-notification-section-heading">
        <h3>เงื่อนไขแจ้งเตือน</h3>
      </div>

      <section className="cp-notification-conditions">
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="activity" size={19} />
          </span>
          <span>
            <small>ระดับฝุ่น{preferences.air_alerts ? "" : " (ปิดอยู่)"}</small>
            <strong>PM2.5 ตั้งแต่ {preferences.pm25_threshold} µg/m³</strong>
          </span>
        </div>
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="clock" size={19} />
          </span>
          <span>
            <small>ช่วงไม่รบกวน</small>
            <strong>
              {preferences.quiet_hours_start && preferences.quiet_hours_end
                ? `${preferences.quiet_hours_start}–${preferences.quiet_hours_end} น.`
                : "ไม่ได้กำหนด"}
            </strong>
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
            <small>ประเภทที่รองรับ</small>
            <strong>คำขอให้ช่วยวัด · คำขอได้รับข้อมูลแล้ว · PM2.5</strong>
          </span>
        </div>

        <button
          type="button"
          className="cp-focus cp-notification-conditions__toggle"
          aria-expanded={editingConditions}
          aria-controls="notification-condition-editor"
          onClick={() => {
            if (editingConditions && persisted) {
              setPreferences({ ...persisted });
              setMessage("ปิดการแก้ไขแล้ว ยังใช้เงื่อนไขที่บันทึกไว้เดิม");
            } else {
              setMessage(null);
              setError(null);
            }
            setEditingConditions((current) => !current);
          }}
        >
          <AppIcon name={editingConditions ? "close" : "settings"} size={17} />
          {editingConditions ? "ปิดการแก้ไข" : "แก้ไขเงื่อนไข"}
        </button>

        {editingConditions && (
          <div
            id="notification-condition-editor"
            className="cp-notification-condition-editor"
          >
            <p role="status">การแก้ไขจะมีผลเมื่อกดบันทึกเงื่อนไข</p>
            <fieldset className="cp-notification-range-group">
              <legend>ระดับและพื้นที่</legend>
              <label>
                <span>
                  แจ้งเมื่อ PM2.5 ถึง
                  <output>{preferences.pm25_threshold} µg/m³</output>
                </span>
                <input
                  type="range"
                  min={37.6}
                  max={500}
                  step={0.1}
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
              <legend>แจ้งเตือนผ่าน LINE</legend>
              <p>มีคำขอให้ช่วยวัด: ตามพื้นที่ผู้ช่วยที่คุณเปิดไว้</p>
              <p>คำขอได้รับข้อมูลแล้ว: เมื่อคำขอของคุณมีรายงานที่เข้าเกณฑ์</p>
              <p>
                แจ้งค่าฝุ่นเฉพาะระดับเริ่มมีผลกระทบต่อสุขภาพ 37.6–75.0
                และมีผลกระทบต่อสุขภาพตั้งแต่ 75.1 µg/m³
                โดยใช้เกณฑ์ที่คุณตั้งหากสูงกว่า
              </p>
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

            <fieldset className="cp-notification-option-group">
              <legend>ช่องทางและช่วงไม่รบกวน</legend>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.line_enabled}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      line_enabled: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>LINE</strong>
                  <small>ใช้เมื่อเชื่อมบัญชี LINE แล้ว</small>
                </span>
              </label>
              <div className="cp-notification-time-grid">
                <label>
                  <span>เริ่มไม่รบกวน</span>
                  <input
                    type="time"
                    value={preferences.quiet_hours_start ?? ""}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        quiet_hours_start: event.target.value || null,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>กลับมาแจ้งเตือน</span>
                  <input
                    type="time"
                    value={preferences.quiet_hours_end ?? ""}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        quiet_hours_end: event.target.value || null,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.consent_granted}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      consent_granted: event.target.checked,
                      consent_granted_at: event.target.checked
                        ? current.consent_granted_at
                        : null,
                    }))
                  }
                />
                <span>
                  <strong>ยินยอมรับการแจ้งเตือนตามเงื่อนไขนี้</strong>
                  <small>
                    ยกเลิกเมื่อใดก็ได้ ระบบจะปิดช่องทางและลบ token ที่ใช้งาน
                  </small>
                </span>
              </label>
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
            {!preferences.consent_granted && (
              <small className="cp-notification-save-hint">
                เมื่อบันทึกโดยไม่ยินยอม ระบบจะปิด LINE ของบัญชีนี้
              </small>
            )}
          </div>
        )}
      </section>

      <div className="cp-notification-feedback" aria-live="polite">
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
