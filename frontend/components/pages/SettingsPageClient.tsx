"use client";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import SettingsPanel, {
  type SettingsSection,
} from "@/frontend/components/panels/SettingsPanel";

export default function SettingsPageClient({
  section,
}: {
  section: SettingsSection;
}) {
  const auth = useAuth();
  const canModerate = ["moderator", "admin"].includes(auth.role);

  return (
    <UserPageShell
      tab="settings"
      icon="settings"
      header={{ showDataStatus: false }}
    >
      <SettingsPanel section={section} showAdmin={canModerate} />
    </UserPageShell>
  );
}
