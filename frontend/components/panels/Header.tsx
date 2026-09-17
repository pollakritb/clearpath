"use client";

import Link from "next/link";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";
import type { DashboardTab } from "@/frontend/types/ui";

interface HeaderProps {
  icon: AppIconName;
  theme: DashboardTab;
  title: string;
  description: string;
  stationCount: number;
  updatedAt: string | null;
  loading: boolean;
  delayedCount: number;
  expiredCount: number;
  error: string | null;
  onRefresh?: () => void;
  showDataStatus?: boolean;
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
  icon,
  theme,
  title,
  description,
  stationCount,
  updatedAt,
  loading,
  delayedCount,
  expiredCount,
  error,
  onRefresh,
  showDataStatus = true,
}: HeaderProps) {
  const hasStaleData = delayedCount > 0 || expiredCount > 0;
  const state = error ? "error" : hasStaleData ? "warning" : "healthy";

  return (
    <header className="cp-context-header" data-theme={theme}>
      <div className="cp-context-header__topline">
        <span className="cp-eyebrow">ClearPath · ประเทศไทย</span>
        <div className="cp-a11y-actions" aria-label="เครื่องมือหน้าเว็บ">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label={loading ? "กำลังรีเฟรชข้อมูล" : "รีเฟรชข้อมูลล่าสุด"}
              title="รีเฟรชข้อมูลล่าสุด"
              className="cp-icon-button cp-focus"
              data-loading={loading}
              disabled={loading}
            >
              <AppIcon name="refresh" size={18} />
            </button>
          )}
          {theme === "settings" ? (
            <Link
              href="/air"
              className="cp-icon-button cp-focus"
              aria-label="ปิดการตั้งค่า"
              title="กลับไปหน้าอากาศวันนี้"
            >
              <AppIcon name="close" size={18} />
            </Link>
          ) : (
            <Link
              href="/settings"
              className="cp-icon-button cp-focus"
              aria-label="เปิดการตั้งค่า"
              title="การตั้งค่า"
            >
              <AppIcon name="settings" size={18} />
            </Link>
          )}
        </div>
      </div>
      <div className="cp-context-header__title">
        <span className="cp-context-header__title-icon">
          <AppIcon name={icon} size={22} />
        </span>
        <span>
          <h1>{title}</h1>
          <p>{description}</p>
        </span>
      </div>

      {showDataStatus && (
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
      )}
    </header>
  );
}
