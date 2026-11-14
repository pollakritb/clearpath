import type { Metadata } from "next";
import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";
export const metadata: Metadata = {
  title: "ลบบัญชี — ClearPath",
  description: "ลบบัญชี ClearPath ของคุณ",
};
export default function PrivacySettingsPage() {
  return <SettingsPageClient section="privacy" />;
}
