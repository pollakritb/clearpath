"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AdminPanel from "@/frontend/components/panels/AdminPanel";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { CommunityReport } from "@/frontend/types";
import type {
  AdminSyncRun,
  AuditLogRow,
  DataHealthResponse,
  DataIssueRow,
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
  reportCount: number;
  reports: CommunityReport[];
  runs: AdminSyncRun[];
  outbox: NotificationOutboxSummary | null;
  dataIssues: DataIssueRow[];
  auditLogs: AuditLogRow[];
  auditHasMore: boolean;
  dataHealth: DataHealthResponse | null;
}

const EMPTY_OVERVIEW: OverviewData = {
  reportCount: 0,
  reports: [],
  runs: [],
  outbox: null,
  dataIssues: [],
  auditLogs: [],
  auditHasMore: false,
  dataHealth: null,
};

export default function AdminApp() {
  const auth = useAuth();
  const [view, setView] = useState<AdminView>("overview");
  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const canModerate = ["moderator", "admin"].includes(auth.role);
  const isAdmin = auth.role === "admin";

  const loadOverview = useCallback(async () => {
    if (!canModerate) return;
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      api.adminReports(),
      api.adminSyncRuns(20),
      api.adminNotificationOutbox(),
      api.adminDataIssues(100),
      isAdmin
        ? api.adminAuditLogs(100, 0)
        : Promise.resolve({
            logs: [],
            count: 0,
            limit: 100,
            offset: 0,
            has_more: false,
          }),
      api.adminDataHealth(),
    ]);
    setOverview((current) => ({
      reportCount:
        results[0].status === "fulfilled"
          ? results[0].value.count
          : current.reportCount,
      reports:
        results[0].status === "fulfilled"
          ? results[0].value.reports
          : current.reports,
      runs:
        results[1].status === "fulfilled"
          ? results[1].value.runs
          : current.runs,
      outbox:
        results[2].status === "fulfilled" ? results[2].value : current.outbox,
      dataIssues:
        results[3].status === "fulfilled"
          ? results[3].value.issues
          : current.dataIssues,
      auditLogs:
        results[4].status === "fulfilled"
          ? results[4].value.logs
          : current.auditLogs,
      auditHasMore:
        results[4].status === "fulfilled"
          ? results[4].value.has_more
          : current.auditHasMore,
      dataHealth:
        results[5].status === "fulfilled"
          ? results[5].value
          : current.dataHealth,
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      setError(
        apiErrorMessage(failed.reason, "โหลดสถานะหลังบ้านบางส่วนไม่สำเร็จ"),
      );
    }
    setLoading(false);
  }, [canModerate, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const latestRun = overview.runs[0];
  const openIssueCount = useMemo(
    () => overview.dataIssues.filter((issue) => issue.status === "new").length,
    [overview.dataIssues],
  );
  const copy = ADMIN_PAGE_COPY[view];

  if (auth.loading || !canModerate) return <AdminAccessGate />;

  return (
    <div className="cp-admin-app">
      <aside className="cp-admin-sidebar">
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
                <strong>
                  <span className="cp-admin-nav-label--mobile">
                    {item.mobileLabel}
                  </span>
                </strong>
                <small>{item.description}</small>
              </span>
              {item.id === "reports" && overview.reportCount > 0 && (
                <b>{overview.reportCount}</b>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <main className="cp-admin-main">
        <header className="cp-admin-topbar">
          <div>
            <span className="cp-eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
          </div>
          <div className="cp-admin-topbar__actions">
            <Link
              href="/"
              className="cp-admin-topbar__home cp-focus"
              aria-label="กลับไปหน้าแผนที่"
            >
              <AppIcon name="map" size={19} />
            </Link>
            <span className="cp-admin-role-pill">
              <AppIcon name="shield" size={15} /> {auth.role}
            </span>
            <button
              type="button"
              className="cp-admin-signout cp-focus"
              onClick={() => void auth.signOut()}
            >
              ออกจากระบบ
            </button>
          </div>
        </header>

        <div className="cp-admin-content cp-scroll">
          {view === "overview" && (
            <AdminOverview
              reportCount={overview.reportCount}
              reports={overview.reports}
              loading={loading}
              error={error}
              latestRun={latestRun}
              dataHealth={overview.dataHealth}
              openIssueCount={openIssueCount}
              onNavigate={setView}
            />
          )}
          {view === "reports" && <AdminPanel />}
          {view === "publishing" && <AdminPublishingPanel isAdmin={isAdmin} />}
          {view === "operations" && (
            <AdminOperationsPanel
              runs={overview.runs}
              outbox={overview.outbox}
              dataIssues={overview.dataIssues}
              auditLogs={overview.auditLogs}
              auditHasMore={overview.auditHasMore}
              auditLoadingMore={auditLoadingMore}
              isAdmin={isAdmin}
              dataHealth={overview.dataHealth}
              loading={loading}
              error={error}
              onRefresh={() => void loadOverview()}
              onLoadMoreAuditLogs={async () => {
                if (!isAdmin || auditLoadingMore || !overview.auditHasMore)
                  return;
                setAuditLoadingMore(true);
                try {
                  const result = await api.adminAuditLogs(
                    100,
                    overview.auditLogs.length,
                  );
                  setOverview((current) => ({
                    ...current,
                    auditLogs: [
                      ...current.auditLogs,
                      ...result.logs.filter(
                        (row) =>
                          !current.auditLogs.some(
                            (existing) => existing.id === row.id,
                          ),
                      ),
                    ],
                    auditHasMore: result.has_more,
                  }));
                } catch (cause) {
                  setError(
                    apiErrorMessage(cause, "โหลด audit log เพิ่มไม่สำเร็จ"),
                  );
                } finally {
                  setAuditLoadingMore(false);
                }
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
