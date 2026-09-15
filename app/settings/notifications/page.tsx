import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "การแจ้งเตือน — ClearPath",
  description: "จัดการช่องทางและเงื่อนไขแจ้งเตือนคุณภาพอากาศ",
};

export default function NotificationSettingsPage() {
  return <ClearPathApp page="settings" settingsSection="notifications" />;
}
