"use client";

import Link from "next/link";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useDisplayPreferences } from "@/frontend/components/settings/DisplayPreferencesProvider";
import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";

import NotificationSettings from "./community/NotificationSettings";
import DataIssueForm from "./community/DataIssueForm";

export type SettingsSection = "overview" | "notifications" | "data-issue";

export default function SettingsPanel({
  section,
  showAdmin = false,
}: {
  section: SettingsSection;
  showAdmin?: boolean;
}) {
  const display = useDisplayPreferences();
  const auth = useAuth();

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
        <NotificationSettings />
      </section>
    );
  }

  if (section === "data-issue") {
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
            <h2>แจ้งข้อมูลผิดพลาด</h2>
            <p>ส่งรายละเอียดให้ผู้ดูแลตรวจสถานี พยากรณ์ หรือแผนที่</p>
          </span>
        </div>
        <section className="cp-settings-card">
          <DataIssueForm />
        </section>
      </section>
    );
  }

  return (
    <section className="cp-settings-page cp-section-enter">
      <section
        className="cp-settings-card"
        aria-labelledby="display-settings-title"
      >
        <SettingsHeading
          icon="activity"
          title="การแสดงผล"
          description="ปรับให้อ่านง่ายขึ้น และมีผลกับทุกหน้า"
          id="display-settings-title"
        />
        <div className="cp-settings-switches">
          <PreferenceSwitch
            label="ตัวอักษรใหญ่"
            description="เพิ่มขนาดข้อความและพื้นที่กด"
            symbol="ก+"
            checked={display.bigText}
            onChange={() => display.setBigText(!display.bigText)}
          />
          <PreferenceSwitch
            label="คอนทราสต์สูง"
            description="เพิ่มความต่างของสีและเส้นขอบ"
            symbol={<span className="cp-contrast-icon" />}
            checked={display.contrast}
            onChange={() => display.setContrast(!display.contrast)}
          />
          <PreferenceSwitch
            label="ลดการเคลื่อนไหว"
            description="ลด Animation และการเปลี่ยนหน้าที่เคลื่อนไหว"
            symbol="นิ่ง"
            checked={display.reduceMotion}
            onChange={() => display.setReduceMotion(!display.reduceMotion)}
          />
        </div>
      </section>

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
            <small>LINE, Web Push, ระดับ PM2.5 และพื้นที่</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </Link>
      </section>

      <section
        className="cp-settings-card"
        aria-labelledby="account-settings-title"
      >
        <SettingsHeading
          icon="user"
          title="บัญชีและความเป็นส่วนตัว"
          description="จัดการบัญชี และดูวิธีที่ ClearPath ใช้ข้อมูล"
          id="account-settings-title"
        />
        <div className="cp-settings-auth">
          <AuthControl compact />
        </div>
        <div className="cp-settings-links">
          {(auth.user || auth.localDemo) && (
            <Link href="/profile" className="cp-settings-row cp-focus">
              <span className="cp-settings-row__icon" aria-hidden="true">
                <AppIcon name="user" size={20} />
              </span>
              <span>
                <strong>โปรไฟล์และผลงาน</strong>
                <small>สถานะรายงาน คำขอบคุณ และกิจกรรม</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </Link>
          )}
          <Link href="/privacy" className="cp-settings-row cp-focus">
            <span className="cp-settings-row__icon" aria-hidden="true">
              <AppIcon name="shield" size={20} />
            </span>
            <span>
              <strong>ความเป็นส่วนตัว</strong>
              <small>การเก็บภาพ ตำแหน่ง และข้อมูลบัญชี</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </Link>
          <Link href="/terms" className="cp-settings-row cp-focus">
            <span className="cp-settings-row__icon" aria-hidden="true">
              <AppIcon name="info" size={20} />
            </span>
            <span>
              <strong>เงื่อนไขการใช้งาน</strong>
              <small>ข้อจำกัดของข้อมูลและคำแนะนำสุขภาพ</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </Link>
          {showAdmin && (
            <Link href="/admin" className="cp-settings-row cp-focus">
              <span className="cp-settings-row__icon" aria-hidden="true">
                <AppIcon name="admin" size={20} />
              </span>
              <span>
                <strong>ศูนย์ควบคุมผู้ดูแล</strong>
                <small>ตรวจรายงาน ประกาศ และสถานะระบบ</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </Link>
          )}
        </div>
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

      <section className="cp-settings-card" aria-labelledby="support-title">
        <SettingsHeading
          icon="info"
          title="ช่วยเหลือ"
          description="แจ้งข้อมูลที่ควรให้ผู้ดูแลตรวจสอบ"
          id="support-title"
        />
        <Link
          href="/settings/report-problem"
          className="cp-settings-row cp-focus"
        >
          <span className="cp-settings-row__icon" aria-hidden="true">
            <AppIcon name="alert" size={20} />
          </span>
          <span>
            <strong>แจ้งข้อมูลผิดพลาด</strong>
            <small>สถานี พยากรณ์ แผนที่ หรือข้อมูลชุมชน</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </Link>
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

function PreferenceSwitch({
  label,
  description,
  symbol,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  symbol: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="cp-settings-switch cp-focus"
      onClick={onChange}
    >
      <span className="cp-settings-switch__symbol" aria-hidden="true">
        {symbol}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="cp-switch" data-active={checked} aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
