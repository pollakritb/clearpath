import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "อากาศวันนี้ — ClearPath",
  description: "ดูค่า PM2.5 คำแนะนำสุขภาพ พยากรณ์ และข้อมูลสถานีทั่วประเทศไทย",
};

export default async function AirPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string | string[] }>;
}) {
  const { station } = await searchParams;
  return (
    <ClearPathApp
      page="overview"
      stationId={typeof station === "string" ? station : undefined}
    />
  );
}
