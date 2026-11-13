"use client";

import AppIcon from "@/frontend/components/ui/AppIcon";
import ReturnToLink from "./ReturnToLink";

export default function SettingsCloseLink({
  href,
  fallback = "/",
}: {
  href?: string;
  fallback?: string;
}) {
  return (
    <ReturnToLink
      href={href}
      fallback={fallback}
      className="cp-icon-button cp-focus"
      aria-label="ปิดการตั้งค่า"
      title="ปิดการตั้งค่า"
    >
      <AppIcon name="close" size={18} />
    </ReturnToLink>
  );
}
