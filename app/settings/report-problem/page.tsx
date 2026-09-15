import type { Metadata } from "next";

import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";

export const metadata: Metadata = {
  title: "แจ้งข้อมูลผิดพลาด — ClearPath",
  description: "แจ้งข้อมูลสถานี พยากรณ์ หรือแผนที่ให้ผู้ดูแลตรวจสอบ",
};

export default function ReportProblemPage() {
  return <SettingsPageClient section="data-issue" />;
}
