"use client";

import Link from "next/link";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";

import HelperSettings from "@/frontend/components/measurement/HelperSettings";
import NotificationSettings from "./community/NotificationSettings";

export type SettingsSection = "overview" | "notifications";

export default function SettingsPanel({
  section,
}: {
  section: SettingsSection;
}) {
  if (section === "notifications") {
    return (
      <section className="cp-settings-page cp-section-enter">
        <Link href="/settings" className="cp-settings-back cp-focus">
          <AppIcon name="back" size={18} />
          กลับไปการตั้งค่า
        </Link>
        <div className="cp-settings-page__heading">
          <span aria-hidden="true">
            <AppIcon name="alert" size={22} />
          </span>
          <span>
            <h2>การแจ้งเตือน</h2>
            <p>เลือกช่องทาง ระดับฝุ่น และพื้นที่ที่สำคัญกับคุณ</p>
          </span>
        </div>
        <HelperSettings />
        <NotificationSettings />
      </section>
    );
  }

  return (
    <section className="cp-settings-page cp-section-enter">
      <section
        className="cp-settings-card"
        aria-labelledby="notification-link-title"
      >
        <SettingsHeading
          icon="alert"
          title="การแจ้งเตือน"
          description="รับเฉพาะข้อมูลสำคัญในพื้นที่ของคุณ"
          id="notification-link-title"
        />
        <Link
          href="/settings/notifications"
          className="cp-settings-row cp-focus"
        >
          <span className="cp-settings-row__icon" aria-hidden="true">
            <AppIcon name="megaphone" size={20} />
          </span>
          <span>
            <strong>ช่องทางและเงื่อนไข</strong>
            <small>LINE, ระดับ PM2.5 และพื้นที่</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </Link>
      </section>

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

function SettingsHeading({
  icon,
  title,
  description,
  id,
}: {
  icon: AppIconName;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <header className="cp-settings-card__heading">
      <span aria-hidden="true">
        <AppIcon name={icon} size={20} />
      </span>
      <span>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </span>
    </header>
  );
}
