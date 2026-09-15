import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "การตั้งค่า — ClearPath",
  description: "จัดการการแสดงผล การแจ้งเตือน บัญชี และความเป็นส่วนตัว",
};

export default function SettingsPage() {
  return <ClearPathApp page="settings" settingsSection="overview" />;
}
