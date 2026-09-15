import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "ข่าวสาร — ClearPath",
  description: "ประกาศสำคัญ การแจ้งเตือน และข้อมูลจากชุมชน ClearPath",
};

export default function CommunityPage() {
  return <ClearPathApp page="community" />;
}
