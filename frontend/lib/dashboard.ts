import type { CommunityReport } from "@/frontend/types";
import type { DashboardTab, SheetSnap } from "@/frontend/types/ui";

import { communitySourceKind } from "./source-kind";

export interface DashboardCopy {
  title: string;
  description: string;
}

export const SHEET_Y: Record<SheetSnap, string> = {
  peek: "82%",
  half: "45%",
  full: "2%",
};

export const DASHBOARD_COPY: Record<DashboardTab, DashboardCopy> = {
  map: {
    title: "แผนที่คุณภาพอากาศ",
    description: "ค้นหาสถานีและดูค่าฝุ่นในพื้นที่ใกล้คุณ",
  },
  overview: {
    title: "อากาศวันนี้",
    description: "ค่าปัจจุบัน คำแนะนำสุขภาพ และประวัติรายสถานี",
  },
  report: {
    title: "ส่งข้อมูลจากเครื่องวัด",
    description: "ถ่ายภาพสดพร้อม GPS แล้วให้ระบบตรวจหลักฐานอัตโนมัติ",
  },
  community: {
    title: "ข่าวสารและประกาศ",
    description: "ประกาศสำคัญ การแจ้งเตือน และข้อมูลที่คุณร่วมแบ่งปัน",
  },
  settings: {
    title: "การตั้งค่า",
    description: "จัดการการแจ้งเตือนและบัญชีของคุณ",
  },
};

export function countCommunitySources(
  reports: Pick<CommunityReport, "source_type">[],
) {
  return reports.reduce(
    (counts, report) => {
      counts[communitySourceKind(report)] += 1;
      return counts;
    },
    { sensor: 0, individual: 0 },
  );
}
