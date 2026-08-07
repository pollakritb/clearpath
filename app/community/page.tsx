import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "ชุมชน — ClearPath",
  description: "ข่าว ประกาศ คำขอบคุณ กิจกรรม และผลงานของชุมชน ClearPath",
};

export default function CommunityPage() {
  return <ClearPathApp page="community" />;
}
