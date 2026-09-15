import type {
  CommunityMapPoint,
  CommunityReport,
  ForecastSurfaceResponse,
  Station,
} from "@/frontend/types";
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
    description: "ค่าปัจจุบัน คำแนะนำ พยากรณ์ และประวัติรายสถานี",
  },
  report: {
    title: "ส่งข้อมูลจากเครื่องวัด",
    description: "ถ่ายภาพสดพร้อม GPS แล้วให้ระบบตรวจหลักฐานอัตโนมัติ",
  },
  community: {
    title: "ชุมชนอากาศสะอาด",
    description: "ติดตามประกาศ ขอบคุณผู้แบ่งปันข้อมูล และร่วมกิจกรรมสะสมคะแนน",
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

export function buildCurrentSurfaceStations(
  stations: Station[],
  mapPoints: CommunityMapPoint[],
): Station[] {
  const officialStations = stations.filter(
    (station) => station.eligible_for_surface,
  );
  const communityStations = mapPoints.map((point): Station => ({
    id: point.id,
    name_th: "รายงานชุมชนที่ผ่านเกณฑ์",
    name_en: "Verified community gap-fill",
    lat: point.lat,
    lon: point.lon,
    province: null,
    pm25: point.pm25,
    aqi: null,
    color: null,
    level: null,
    recorded_at: null,
    data_status: "fresh",
    age_minutes: null,
    eligible_for_surface: true,
    in_service_area: true,
  }));
  return [...officialStations, ...communityStations];
}

export function buildForecastSurfaceStations(
  surface: ForecastSurfaceResponse | null,
  horizonHours: number,
): Station[] {
  if (!surface) return [];
  return surface.cells.flatMap((cell, index): Station[] => {
    if (cell.pm25 == null) return [];
    return [
      {
        id: `forecast-${horizonHours}-${index}`,
        name_th: `พื้นผิวพยากรณ์ ${horizonHours} ชั่วโมง`,
        name_en: "Forecast surface",
        lat: cell.lat,
        lon: cell.lon,
        province: null,
        pm25: cell.pm25,
        aqi: null,
        color: null,
        level: null,
        recorded_at: surface.generated_at,
        data_status: cell.coverage === "covered" ? "fresh" : "delayed",
        age_minutes: null,
        eligible_for_surface: true,
        in_service_area: true,
      },
    ];
  });
}
