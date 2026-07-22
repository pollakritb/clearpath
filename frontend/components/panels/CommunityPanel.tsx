import type { Activity, Announcement, UserReputation } from "@/frontend/types";

import AnnouncementsSection from "./community/AnnouncementsSection";
import ReviewQueue from "./community/ReviewQueue";
import RewardsSection from "./community/RewardsSection";
import NotificationSettings from "./community/NotificationSettings";
import NotificationInbox from "./community/NotificationInbox";
import MyContribution from "./community/MyContribution";

interface CommunityPanelProps {
  announcements: Announcement[];
  activities: Activity[];
  leaders: UserReputation[];
  onRefresh: () => void;
}

export default function CommunityPanel({
  announcements,
  activities,
  leaders,
  onRefresh,
}: CommunityPanelProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1em" }}>
      <AnnouncementsSection announcements={announcements} />
      <NotificationInbox />
      <MyContribution />
      <NotificationSettings />
      <ReviewQueue onRefresh={onRefresh} />
      <RewardsSection activities={activities} leaders={leaders} />
    </section>
  );
}
