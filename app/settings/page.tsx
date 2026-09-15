import type { Metadata } from "next";

import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";

export const metadata: Metadata = {
  title: "การตั้งค่า — ClearPath",
  description: "จัดการการแสดงผล การแจ้งเตือน บัญชี และความเป็นส่วนตัว",
};

export default function SettingsPage() {
  return <SettingsPageClient section="overview" />;
}
