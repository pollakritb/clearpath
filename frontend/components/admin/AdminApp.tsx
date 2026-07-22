"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AdminPanel from "@/frontend/components/panels/AdminPanel";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  AdminSyncRun,
  ForecastModelStatus,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";

import AdminAccessGate from "./AdminAccessGate";
import {
  ADMIN_NAV_ITEMS,
  ADMIN_PAGE_COPY,
  type AdminView,
} from "./admin-navigation";
import AdminOperationsPanel from "./AdminOperationsPanel";
import AdminOverview from "./AdminOverview";
import AdminPublishingPanel from "./AdminPublishingPanel";

interface OverviewData {
  queueCount: number;
  runs: AdminSyncRun[];
  models: ForecastModelStatus[];
  outbox: NotificationOutboxSummary | null;
}

const EMPTY_OVERVIEW: OverviewData = {
  queueCount: 0,
  runs: [],
  models: [],
  outbox: null,
};

export default function AdminApp() {
  const auth = useAuth();
  const [view, setView] = useState<AdminView>("overview");
  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canModerate = ["moderator", "admin"].includes(auth.role);
  const isAdmin = auth.role === "admin";

  const loadOverview = useCallback(async () => {
    if (!canModerate) return;
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      api.adminReports(),
      api.adminSyncRuns(20),
      api.adminForecastModels(),
      api.adminNotificationOutbox(),
    ]);
    setOverview((current) => ({
      queueCount:
        results[0].status === "fulfilled"
          ? results[0].value.count
          : current.queueCount,
      runs:
        results[1].status === "fulfilled"
          ? results[1].value.runs
          : current.runs,
      models:
        results[2].status === "fulfilled"
          ? results[2].value.models
          : current.models,
      outbox:
        results[3].status === "fulfilled" ? results[3].value : current.outbox,
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      setError(
        apiErrorMessage(failed.reason, "โหลดสถานะหลังบ้านบางส่วนไม่สำเร็จ"),
      );
    }
    setLoading(false);
  }, [canModerate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const latestRun = overview.runs[0];
  const activeModels = useMemo(
    () => overview.models.filter((model) => model.active).length,
    [overview.models],
  );
  const copy = ADMIN_PAGE_COPY[view];

  if (auth.loading || !canModerate) return <AdminAccessGate />;

  return (
    <div className="cp-admin-app">
      <aside className="cp-admin-sidebar">
        <div className="cp-admin-brand">
          <span>C</span>
          <div>
            <strong>ClearPath</strong>
            <small>ADMIN CONSOLE</small>
          </div>
        </div>
        <div className="cp-admin-sidebar__label">จัดการระบบ</div>
        <nav aria-label="เมนูผู้ดูแล">
          {ADMIN_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              data-active={view === item.id}
              className="cp-admin-nav-item cp-focus"
            >
              <span>
                <AppIcon name={item.icon} size={20} />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              {item.id === "moderation" && overview.queueCount > 0 && (
                <b>{overview.queueCount}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="cp-admin-sidebar__footer">
          <Link href="/" className="cp-admin-user-link cp-focus">
            <AppIcon name="map" size={18} />
            <span>กลับไปหน้าแผนที่</span>
          </Link>
          <div className="cp-admin-role-card">
            <span>
              <AppIcon name="user" size={18} />
            </span>
            <div>
              <strong>{auth.user?.email ?? "Local demo"}</strong>
              <small>{auth.role}</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="cp-admin-main">
        <header className="cp-admin-topbar">
          <div>
            <span className="cp-eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
          </div>
          <div className="cp-admin-topbar__actions">
            <span className="cp-admin-role-pill">
              <AppIcon name="shield" size={15} /> {auth.role}
            </span>
            <AuthControl compact />
          </div>
        </header>

        <div className="cp-admin-content cp-scroll">
          {view === "overview" && (
            <AdminOverview
              queueCount={overview.queueCount}
              loading={loading}
              error={error}
              latestRun={latestRun}
              activeModels={activeModels}
              modelCount={overview.models.length}
              isAdmin={isAdmin}
              onNavigate={setView}
            />
          )}
          {view === "moderation" && (
            <AdminPanel
              onChanged={() => void loadOverview()}
              onQueueCountChange={(queueCount) =>
                setOverview((current) => ({ ...current, queueCount }))
              }
            />
          )}
          {view === "publishing" && (
            <AdminPublishingPanel
              isAdmin={isAdmin}
              onPublished={() => undefined}
            />
          )}
          {view === "operations" && (
            <AdminOperationsPanel
              runs={overview.runs}
              models={overview.models}
              outbox={overview.outbox}
              loading={loading}
              error={error}
              onRefresh={() => void loadOverview()}
            />
          )}
        </div>
      </main>
    </div>
  );
}
