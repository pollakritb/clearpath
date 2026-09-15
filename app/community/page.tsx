import type { Metadata } from "next";

import NewsPageClient from "@/frontend/components/pages/NewsPageClient";

export const metadata: Metadata = {
  title: "ข่าวสาร — ClearPath",
  description: "ประกาศสำคัญ การแจ้งเตือน และข้อมูลจากชุมชน ClearPath",
};

export default function CommunityPage() {
  return <NewsPageClient />;
}
