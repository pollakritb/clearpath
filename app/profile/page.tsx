import type { Metadata } from "next";

import ProfilePageClient from "@/frontend/components/pages/ProfilePageClient";

export const metadata: Metadata = {
  title: "ผลงานและอันดับ — ClearPath",
  description: "ดูสถานะรายงานและกิจกรรมของคุณ",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return <ProfilePageClient tab={typeof tab === "string" ? tab : undefined} />;
}
