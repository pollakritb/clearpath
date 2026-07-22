"use client";

import AuthControl from "@/frontend/components/auth/AuthControl";
import AppIcon from "@/frontend/components/ui/AppIcon";

interface HeaderProps {
  title: string;
  description: string;
  stationCount: number;
  updatedAt: string | null;
  loading: boolean;
  delayedCount: number;
  expiredCount: number;
  error: string | null;
  bigText: boolean;
  contrast: boolean;
  onToggleBigText: () => void;
  onToggleContrast: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Header({
  title,
  description,
  stationCount,
  updatedAt,
  loading,
  delayedCount,
  expiredCount,
  error,
  bigText,
  contrast,
  onToggleBigText,
  onToggleContrast,
}: HeaderProps) {
  const hasStaleData = delayedCount > 0 || expiredCount > 0;
  const state = error ? "error" : hasStaleData ? "warning" : "healthy";

  return (
    <header className="cp-context-header">
      <div className="cp-context-header__topline">
        <span className="cp-eyebrow">ศูนย์ข้อมูลคุณภาพอากาศ</span>
        <div className="cp-a11y-actions" aria-label="การช่วยการเข้าถึง">
          <button
            type="button"
            onClick={onToggleBigText}
            aria-label="สลับขนาดตัวอักษรใหญ่"
            aria-pressed={bigText}
            className="cp-icon-button cp-focus"
            data-active={bigText}
          >
            ก+
          </button>
          <button
            type="button"
            onClick={onToggleContrast}
            aria-label="สลับโหมดคอนทราสต์สูง"
            aria-pressed={contrast}
            className="cp-icon-button cp-focus"
            data-active={contrast}
          >
            <span className="cp-contrast-icon" aria-hidden />
          </button>
        </div>
      </div>
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="cp-data-status" data-state={state}>
        <span className="cp-data-status__icon">
          <AppIcon
            name={error ? "alert" : hasStaleData ? "activity" : "check"}
            size={18}
          />
        </span>
        <span className="cp-data-status__copy">
          <strong>
            {error
              ? "เชื่อมต่อข้อมูลไม่ได้"
              : loading
                ? "กำลังอัปเดตข้อมูล"
                : `${stationCount} สถานีพร้อมใช้งาน`}
          </strong>
          <small>
            {error
              ? "ระบบจะแสดงข้อมูลล่าสุดที่มีอยู่"
              : hasStaleData
                ? `ล่าช้า ${delayedCount} · หมดอายุ ${expiredCount}`
                : `อัปเดตล่าสุด ${fmtTime(updatedAt)} น.`}
          </small>
        </span>
        <span className="cp-data-status__source">Air4Thai</span>
      </div>

      <div className="cp-context-header__auth">
        <AuthControl compact />
      </div>
    </header>
  );
}
