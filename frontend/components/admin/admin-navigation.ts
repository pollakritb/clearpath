import type { AppIconName } from "@/frontend/components/ui/AppIcon";

export type AdminView = "overview" | "moderation" | "publishing" | "operations";

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
    id: "moderation",
    label: "คิวตรวจข้อยกเว้น",
    mobileLabel: "คิวตรวจ",
    description: "เคสที่ระบบยังไม่มั่นใจ",
    icon: "shield",
  },
  {
    id: "publishing",
    label: "ประกาศและกิจกรรม",
    mobileLabel: "ประกาศ",
    description: "สื่อสารกับชุมชน",
    icon: "megaphone",
  },
  {
    id: "operations",
    label: "ข้อมูลและโมเดล",
    mobileLabel: "ระบบ",
    description: "Air4Thai sync และ ML",
    icon: "activity",
  },
];

export const ADMIN_PAGE_COPY: Record<
  AdminView,
  { eyebrow: string; title: string }
> = {
  overview: { eyebrow: "ภาพรวมผู้ดูแล", title: "ศูนย์ควบคุม ClearPath" },
  moderation: {
    eyebrow: "Review exceptions",
    title: "คิวตรวจเคสที่ระบบยังไม่มั่นใจ",
  },
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
