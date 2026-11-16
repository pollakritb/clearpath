"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { NotificationPreferences } from "@/frontend/types";

import AlertLocationControls from "./AlertLocationControls";
import { ALERT_PREFERENCES_CHANGED } from "@/frontend/components/auth/AlertLocationPresence";
import LineNotificationCard from "./LineNotificationCard";

const DEFAULTS: NotificationPreferences = {
  line_enabled: true,
  district: null,
  subdistrict: null,
  radius_km: 2,
  center_lat: null,
  center_lon: null,
  pm25_threshold: 37.6,
  air_alerts: true,
  air_alert_warning: true,
  air_alert_danger: true,
  hotspot_alerts: true,
  community_alerts: false,
  report_status_alerts: true,
  rating_alerts: true,
  reward_alerts: true,
  leaderboard_alerts: false,
  announcement_alerts: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "Asia/Bangkok",
  consent_granted: false,
  consent_granted_at: null,
};

const ALERT_OPTIONS = [
  [
    "air_alerts",
    "เปิดแจ้งเตือนค่าฝุ่น",
    "ใช้หมุดใกล้ GPS ล่าสุดที่สุดภายใน 2 กม.",
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
          ...DEFAULTS,
          ...value,
          radius_km: 2,
          pm25_threshold: 37.6,
          quiet_hours_start: null,
          quiet_hours_end: null,
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

  useEffect(() => {
    const changed = () => {
      if (!editingConditions) setReload((value) => value + 1);
    };
    window.addEventListener(ALERT_PREFERENCES_CHANGED, changed);
    return () => window.removeEventListener(ALERT_PREFERENCES_CHANGED, changed);
  }, [editingConditions]);

  async function savePreferences() {
    if (!persisted || loadState !== "ready" || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateNotificationPreferences({
        ...preferences,
        consent_granted: true,
      });
      setPreferences(saved);
      setPersisted(saved);
      window.dispatchEvent(new Event(ALERT_PREFERENCES_CHANGED));
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
            <strong>37.6–75.0 และตั้งแต่ 75.1 µg/m³</strong>
          </span>
        </div>
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="clock" size={19} />
          </span>
          <span>
            <small>ความถี่แจ้งเตือน</small>
            <strong>แต่ละระดับวันละ 1 ครั้ง · นับวันตามเวลาไทย</strong>
          </span>
        </div>
        <div className="cp-notification-condition-summary">
          <span aria-hidden="true">
            <AppIcon name="location" size={19} />
          </span>
          <span>
            <small>ระยะค้นหาหมุด</small>
            <strong>{"ค้นหาหมุดใกล้ที่สุดภายใน 2 กม."}</strong>
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

        <AlertLocationControls enabled={Boolean(persisted?.air_alerts)} />

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
            <fieldset className="cp-notification-option-group">
              <legend>ระดับและพื้นที่</legend>
              <p>
                ค้นหาหมุดใกล้ที่สุดภายใน 2 กม. ระยะและเกณฑ์ค่าฝุ่นกำหนดไว้คงที่
              </p>
              <p>
                วันละ 1 ครั้งต่อระดับ
                หากแจ้งระดับสูงแล้วจะไม่แจ้งระดับต่ำซ้ำในวันนั้น
              </p>
              {(
                [
                  [
                    "air_alert_warning",
                    "37.6–75.0 µg/m³",
                    "เริ่มมีผลกระทบต่อสุขภาพ",
                  ],
                  [
                    "air_alert_danger",
                    "75.1 µg/m³ ขึ้นไป",
                    "มีผลกระทบต่อสุขภาพ",
                  ],
                ] as const
              ).map(([key, label, description]) => (
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
              <legend>แจ้งเตือนผ่าน LINE</legend>
              <p>มีคำขอให้ช่วยวัด: ตามพื้นที่ผู้ช่วยที่คุณเปิดไว้</p>
              <p>คำขอได้รับข้อมูลแล้ว: เมื่อคำขอของคุณมีรายงานที่เข้าเกณฑ์</p>
              <p>
                แจ้งค่าฝุ่นเฉพาะระดับเริ่มมีผลกระทบต่อสุขภาพ 37.6–75.0
                และมีผลกระทบต่อสุขภาพตั้งแต่ 75.1 µg/m³
                เมื่อค่าฝุ่นสูงขึ้นเป็นอีกระดับจะแจ้งเพิ่มได้ 1 ครั้งในวันนั้น
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
              <legend>ช่องทางแจ้งเตือน</legend>
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
            </fieldset>

            <button
              type="button"
              disabled={saving}
              onClick={() => void savePreferences()}
              className="cp-focus cp-notification-save"
            >
              <AppIcon name="check" size={18} />
              บันทึกเงื่อนไข
            </button>
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
