"use client";

import { type ReactNode, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import Header from "@/frontend/components/panels/Header";
import { useDisplayPreferences } from "@/frontend/components/settings/DisplayPreferencesProvider";
import type { AppIconName } from "@/frontend/components/ui/AppIcon";
import { DASHBOARD_COPY, SHEET_Y } from "@/frontend/lib/dashboard";
import type { DashboardTab, SheetSnap } from "@/frontend/types/ui";

import DashboardSidebar from "./DashboardSidebar";

interface HeaderState {
  title?: string;
  description?: string;
  stationCount?: number;
  updatedAt?: string | null;
  loading?: boolean;
  delayedCount?: number;
  expiredCount?: number;
  error?: string | null;
  onRefresh?: () => void;
  showDataStatus?: boolean;
  showAuth?: boolean;
}

interface UserPageShellProps {
  tab: DashboardTab;
  icon: AppIconName;
  children: ReactNode;
  main?: ReactNode;
  header?: HeaderState;
}

export default function UserPageShell({
  tab,
  icon,
  children,
  main,
  header = {},
}: UserPageShellProps) {
  const auth = useAuth();
  const display = useDisplayPreferences();
  const [snap, setSnap] = useState<SheetSnap>("half");
  const copy = DASHBOARD_COPY[tab];
  const canModerate = ["moderator", "admin"].includes(auth.role);
  const rootStyle = {
    fontSize: display.bigText ? "18px" : "15px",
    lineHeight: 1.45,
    fontFamily: "var(--font-noto-thai), system-ui, sans-serif",
    "--cp-aside-w": display.bigText ? "460px" : "420px",
    "--cp-sheet-y": SHEET_Y[snap],
  } as React.CSSProperties;

  return (
    <div
      className="cp-app"
      data-contrast={display.contrast}
      data-reduce-motion={display.reduceMotion}
      data-tab={tab}
      data-sheet-snap={snap}
      style={rootStyle}
    >
      <DashboardSidebar
        tab={tab}
        snap={snap}
        onSnapChange={setSnap}
        showAdmin={canModerate}
        header={
          <Header
            icon={icon}
            theme={tab}
            title={header.title ?? copy.title}
            description={header.description ?? copy.description}
            stationCount={header.stationCount ?? 0}
            updatedAt={header.updatedAt ?? null}
            loading={header.loading ?? false}
            delayedCount={header.delayedCount ?? 0}
            expiredCount={header.expiredCount ?? 0}
            error={header.error ?? null}
            onRefresh={header.onRefresh}
            showDataStatus={header.showDataStatus ?? true}
            showAuth={header.showAuth ?? true}
          />
        }
      >
        {children}
      </DashboardSidebar>
      {main}
    </div>
  );
}
