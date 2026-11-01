import { redirect } from "next/navigation";

export default function LeaderboardPage() {
  redirect("/profile?tab=leaderboard");
}
