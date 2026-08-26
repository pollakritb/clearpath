import type { CommunityReport } from "@/frontend/types";

export type MapSourceKind = "official" | "sensor" | "individual";

export function communitySourceKind(
  report: Pick<CommunityReport, "source_type">,
): Exclude<MapSourceKind, "official"> {
  return report.source_type === "community_sensor" ? "sensor" : "individual";
}

export const SOURCE_LABELS: Record<
  MapSourceKind,
  { label: string; shortLabel: string; description: string }
> = {
  official: {
    label: "สถานีตรวจวัดทางการ",
    shortLabel: "สถานีรัฐ",
    description: "Air4Thai · กรมควบคุมมลพิษ",
  },
  sensor: {
    label: "สถานีเซนเซอร์ชุมชน",
    shortLabel: "สถานีชุมชน",
    description: "อุปกรณ์ประจำจุดที่ลงทะเบียนกับ ClearPath",
  },
  individual: {
    label: "รายงานจากบุคคล",
    shortLabel: "บุคคลรายงาน",
    description: "ผู้ใช้ถ่ายเครื่องวัดพร้อมยืนยัน GPS",
  },
};
