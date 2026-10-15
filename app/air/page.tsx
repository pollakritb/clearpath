import type { Metadata } from "next";

import TodayPageClient from "@/frontend/components/pages/TodayPageClient";

export const metadata: Metadata = {
  title: "อากาศวันนี้ — ClearPath",
  description: "ดูค่า PM2.5 ปัจจุบัน คำแนะนำสุขภาพ และข้อมูลสถานีทั่วประเทศไทย",
};

export default async function AirPage({
  searchParams,
}: {
  searchParams: Promise<{
    station?: string | string[];
    lat?: string | string[];
    lon?: string | string[];
    place?: string | string[];
  }>;
}) {
  const { station, lat, lon, place } = await searchParams;
  const areaLat = typeof lat === "string" ? Number(lat) : NaN;
  const areaLon = typeof lon === "string" ? Number(lon) : NaN;
  const area =
    typeof station !== "string" &&
    Number.isFinite(areaLat) &&
    Number.isFinite(areaLon) &&
    areaLat >= 5 &&
    areaLat <= 21 &&
    areaLon >= 97 &&
    areaLon <= 106
      ? {
          lat: areaLat,
          lon: areaLon,
          name: typeof place === "string" ? place.slice(0, 100) : undefined,
        }
      : undefined;
  return (
    <TodayPageClient
      stationId={typeof station === "string" ? station : undefined}
      area={area}
    />
  );
}
