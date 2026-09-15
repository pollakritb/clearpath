import type { Metadata } from "next";

import ReportPageClient from "@/frontend/components/pages/ReportPageClient";

export const metadata: Metadata = {
  title: "ส่งข้อมูล — ClearPath",
  description: "ส่งภาพเครื่องวัด PM2.5 พร้อม GPS ให้ระบบตรวจหลักฐานอัตโนมัติ",
};

export default function ReportPage() {
  return <ReportPageClient />;
}
