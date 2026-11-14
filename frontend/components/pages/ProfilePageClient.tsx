"use client";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import ProfilePanel from "@/frontend/components/panels/ProfilePanel";

export default function ProfilePageClient({ tab }: { tab?: string }) {
  return (
    <UserPageShell
      tab="settings"
      icon="user"
      header={{
        title: "ผลงานและอันดับ",
        description: "",
        showDataStatus: false,
      }}
    >
      <ProfilePanel tab={tab} />
    </UserPageShell>
  );
}
