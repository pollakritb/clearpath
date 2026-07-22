import type { AppIconName } from "@/frontend/components/ui/AppIcon";

export type AdminView = "overview" | "moderation" | "publishing" | "operations";

export const ADMIN_NAV_ITEMS: Array<{
  id: AdminView;
  label: string;
  description: string;
  icon: AppIconName;
}> = [
  {
    id: "overview",
    label: "ภาพรวม",
    description: "งานสำคัญวันนี้",
    icon: "home",
  },
  {
    id: "moderation",
    label: "คิวตรวจรายงาน",
    description: "ตรวจภาพและค่า PM2.5",
    icon: "shield",
  },
  {
    id: "publishing",
    label: "ประกาศและกิจกรรม",
    description: "สื่อสารกับชุมชน",
    icon: "megaphone",
  },
  {
    id: "operations",
    label: "ข้อมูลและโมเดล",
    description: "Air4Thai sync และ ML",
    icon: "activity",
  },
];

export const ADMIN_PAGE_COPY: Record<
  AdminView,
  { eyebrow: string; title: string }
> = {
  overview: { eyebrow: "Admin overview", title: "ศูนย์ควบคุม ClearPath" },
  moderation: { eyebrow: "Data moderation", title: "คิวตรวจสอบข้อมูลชุมชน" },
  publishing: {
    eyebrow: "Community management",
    title: "จัดการเนื้อหาชุมชน",
  },
  operations: { eyebrow: "System health", title: "สถานะข้อมูลและการพยากรณ์" },
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
