import type { Metadata } from "next";
import LeaderboardPageClient from "@/frontend/components/pages/LeaderboardPageClient";
export const metadata: Metadata = {
  title: "อันดับชุมชน — ClearPath",
  description: "XP สะสม ยศ และอันดับการมีส่วนร่วมของชุมชน",
};
export default function LeaderboardPage() {
  return <LeaderboardPageClient />;
}
