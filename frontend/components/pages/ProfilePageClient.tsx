"use client";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import ProfilePanel from "@/frontend/components/panels/ProfilePanel";

export default function ProfilePageClient() {
  return (
    <UserPageShell
      tab="settings"
      icon="user"
      header={{
        title: "โปรไฟล์ของฉัน",
        description: "รายงานและกิจกรรมที่คุณมีส่วนร่วม",
        showDataStatus: false,
      }}
    >
      <ProfilePanel />
    </UserPageShell>
  );
}
