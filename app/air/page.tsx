import type { Metadata } from "next";

import TodayPageClient from "@/frontend/components/pages/TodayPageClient";

export const metadata: Metadata = {
  title: "อากาศวันนี้ — ClearPath",
  description: "ดูค่า PM2.5 ปัจจุบัน คำแนะนำสุขภาพ และข้อมูลสถานีทั่วประเทศไทย",
};

export default async function AirPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string | string[] }>;
}) {
  const { station } = await searchParams;
  return (
    <TodayPageClient
      stationId={typeof station === "string" ? station : undefined}
    />
  );
}
