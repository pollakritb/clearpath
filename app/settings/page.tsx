import type { Metadata } from "next";

import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";

export const metadata: Metadata = {
  title: "การตั้งค่า — ClearPath",
  description: "จัดการการแจ้งเตือนและสิทธิ์อุปกรณ์",
};

export default function SettingsPage() {
  return <SettingsPageClient section="overview" />;
}
