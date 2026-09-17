import type { Metadata } from "next";

import ProfilePageClient from "@/frontend/components/pages/ProfilePageClient";

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน — ClearPath",
  description: "ดูสถานะรายงานและกิจกรรมของคุณ",
};

export default function ProfilePage() {
  return <ProfilePageClient />;
}
