import type { Metadata } from "next";

import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";

export const metadata: Metadata = {
  title: "การแจ้งเตือน — ClearPath",
  description: "จัดการช่องทางและเงื่อนไขแจ้งเตือนคุณภาพอากาศ",
};

export default function NotificationSettingsPage() {
  return <SettingsPageClient section="notifications" />;
}
