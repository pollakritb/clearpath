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
      header={{ showDataStatus: false }}
    >
      <SettingsPanel section={section} />
    </UserPageShell>
  );
}
