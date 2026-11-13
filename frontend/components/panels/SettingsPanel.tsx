"use client";

import SettingsLink from "@/frontend/components/app/SettingsLink";

import AppIcon from "@/frontend/components/ui/AppIcon";
import styles from "@/frontend/styles/mobile-refinements.module.css";

import HelperSettings from "@/frontend/components/measurement/HelperSettings";
import AccountPrivacyPanel from "./AccountPrivacyPanel";
import NotificationSettings from "./community/NotificationSettings";

export type SettingsSection = "overview" | "notifications" | "privacy";

export default function SettingsPanel({
  section,
}: {
  section: SettingsSection;
}) {
  if (section === "privacy") return <AccountPrivacyPanel />;
  if (section === "notifications") {
    return (
      <section
        className={`cp-settings-page cp-section-enter ${styles.settings}`}
      >
        <SettingsLink
          href="/settings"
          replace
          data-safe-back
          className="cp-settings-back cp-focus"
        >
          <AppIcon name="back" size={18} />
          กลับไปการตั้งค่า
        </SettingsLink>
        <div className="cp-settings-page__heading">
          <div>
            <h2>การแจ้งเตือน</h2>
            <p>เลือกช่องทาง ระดับฝุ่น และพื้นที่ที่สำคัญกับคุณ</p>
          </div>
        </div>
        <HelperSettings />
        <NotificationSettings />
      </section>
    );
  }

  return (
    <section className={`cp-settings-page cp-section-enter ${styles.settings}`}>
      <SettingsLink
        href="/settings/notifications"
        className="cp-settings-row cp-focus"
      >
        <span className="cp-settings-row__icon" aria-hidden="true">
          <AppIcon name="alert" size={20} />
        </span>
        <span>
          <strong>การแจ้งเตือน</strong>
          <small>ช่องทาง ระดับฝุ่น และพื้นที่รับคำขอ</small>
        </span>
        <AppIcon name="chevron" size={18} />
      </SettingsLink>

      <SettingsLink
        href="/settings/privacy"
        className="cp-settings-row cp-focus"
      >
        <span className="cp-settings-row__icon" aria-hidden="true">
          <AppIcon name="shield" size={20} />
        </span>
        <span>
          <strong>ข้อมูลบัญชี</strong>
          <small>คำขอลบบัญชี</small>
        </span>
        <AppIcon name="chevron" size={18} />
      </SettingsLink>

      <section className="cp-settings-permissions" aria-label="สิทธิ์อุปกรณ์">
        <span aria-hidden="true">
          <AppIcon name="shield" size={20} />
        </span>
        <span>
          <strong>สิทธิ์กล้องและตำแหน่ง</strong>
          <small>
            ระบบจะขอสิทธิ์เมื่อคุณใช้ฟีเจอร์นั้นเท่านั้น
            เปลี่ยนสิทธิ์ได้จากการตั้งค่าเบราว์เซอร์หรืออุปกรณ์
          </small>
        </span>
      </section>
    </section>
  );
}
