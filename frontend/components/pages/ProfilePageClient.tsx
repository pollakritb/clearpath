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
        description: "รายงาน Trust และกิจกรรมที่คุณมีส่วนร่วม",
        showDataStatus: false,
        showAuth: false,
      }}
    >
      <ProfilePanel />
    </UserPageShell>
  );
}
