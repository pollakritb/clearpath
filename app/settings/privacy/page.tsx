import type { Metadata } from "next";
import SettingsPageClient from "@/frontend/components/pages/SettingsPageClient";
export const metadata: Metadata = {
  title: "ข้อมูลบัญชี — ClearPath",
  description: "ดาวน์โหลดข้อมูลกิจกรรมและส่งคำขอลบบัญชี",
};
export default function PrivacySettingsPage() {
  return <SettingsPageClient section="privacy" />;
}
