"use client";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import SettingsPanel, {
  type SettingsSection,
} from "@/frontend/components/panels/SettingsPanel";

export default function SettingsPageClient({
  section,
}: {
  section: SettingsSection;
}) {
  return (
    <UserPageShell
      tab="settings"
      icon="settings"
      header={{
        showDataStatus: false,
        ...(section === "privacy"
          ? {
              title: "ลบบัญชี",
              description: "บัญชี ClearPath ของคุณ",
            }
          : section === "notifications"
            ? {
                title: "การแจ้งเตือน",
                description: "ช่องทางและเงื่อนไขรับแจ้งเตือน",
              }
            : {}),
      }}
    >
      <SettingsPanel section={section} />
    </UserPageShell>
  );
}
