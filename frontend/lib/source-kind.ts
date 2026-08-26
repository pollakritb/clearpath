import type { CommunityReport } from "@/frontend/types";

export type MapSourceKind = "official" | "sensor" | "individual";

export function communitySourceKind(
  report: Pick<CommunityReport, "device_calibrated">,
): Exclude<MapSourceKind, "official"> {
  return report.device_calibrated ? "sensor" : "individual";
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
    label: "เซนเซอร์ชุมชน",
    shortLabel: "เซนเซอร์",
    description: "เครื่องที่ระบุข้อมูลการสอบเทียบ",
  },
  individual: {
    label: "รายงานจากประชาชน",
    shortLabel: "บุคคล",
    description: "ภาพเครื่องวัดที่ผ่านการตรวจ",
  },
};
