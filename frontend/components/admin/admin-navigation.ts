import type { AppIconName } from "@/frontend/components/ui/AppIcon";

export type AdminView = "overview" | "reports" | "publishing" | "operations";

export const ADMIN_NAV_ITEMS: Array<{
  id: AdminView;
  label: string;
  mobileLabel: string;
  description: string;
  icon: AppIconName;
}> = [
  {
    id: "overview",
    label: "ภาพรวม",
    mobileLabel: "ภาพรวม",
    description: "งานสำคัญวันนี้",
    icon: "home",
  },
  {
    id: "reports",
    label: "ประวัติรายงาน",
    mobileLabel: "รายงาน",
    description: "ภาพ ผล OCR และรายละเอียด",
    icon: "shield",
  },
  {
    id: "publishing",
    label: "ประกาศ",
    mobileLabel: "ประกาศ",
    description: "ข่าวสารและกิจกรรม",
    icon: "megaphone",
  },
  {
    id: "operations",
    label: "สถานะระบบ",
    mobileLabel: "ระบบ",
    description: "ข้อมูล ปัญหา และ audit",
    icon: "activity",
  },
];

export const ADMIN_PAGE_COPY: Record<
  AdminView,
  { eyebrow: string; title: string }
> = {
  overview: { eyebrow: "ภาพรวมผู้ดูแล", title: "ศูนย์ควบคุม ClearPath" },
  reports: {
    eyebrow: "Automatic review log",
    title: "ประวัติรายงานจากผู้ใช้",
  },
  publishing: {
    eyebrow: "Community management",
    title: "จัดการเนื้อหาชุมชน",
  },
  operations: { eyebrow: "System health", title: "สถานะข้อมูลและบริการ" },
};

export function formatRelative(value?: string | null): string {
  if (!value) return "ยังไม่มีข้อมูล";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "ไม่ทราบเวลา";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.round(minutes / 60);
  return hours < 24
    ? `${hours} ชั่วโมงที่แล้ว`
    : `${Math.round(hours / 24)} วันที่แล้ว`;
}
