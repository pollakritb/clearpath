import type {
  AdminSyncRun,
  AuditLogRow,
  DataHealthResponse,
  DataIssueRow,
  DataIssueUpdateRequest,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";

import AdminAuditLogList from "./AdminAuditLogList";
import DataIssueTriageList from "./DataIssueTriageList";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function healthLabel(status?: DataHealthResponse["status"]): string {
  if (status === "healthy") return "ปกติ";
  if (status === "degraded") return "ควรตรวจสอบ";
  if (status === "critical") return "ผิดปกติ";
  return "กำลังตรวจสอบ";
}

export default function AdminOperationsPanel({
  runs,
  outbox,
  dataIssues,
  auditLogs,
  auditHasMore,
  auditLoadingMore,
  isAdmin,
  dataHealth,
  loading,
  error,
  onRefresh,
  onTransitionDataIssue,
  onLoadMoreAuditLogs,
}: {
  runs: AdminSyncRun[];
  outbox: NotificationOutboxSummary | null;
  dataIssues: DataIssueRow[];
  auditLogs: AuditLogRow[];
  auditHasMore: boolean;
  auditLoadingMore: boolean;
  isAdmin: boolean;
  dataHealth: DataHealthResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onTransitionDataIssue: (
    issue: DataIssueRow,
    body: DataIssueUpdateRequest,
  ) => Promise<void>;
  onLoadMoreAuditLogs: () => Promise<void>;
}) {
  const newIssueCount = dataIssues.filter(
    (issue) => issue.status === "new",
  ).length;
  const notificationProblemCount = outbox ? outbox.failed + outbox.dead : null;

  return (
    <section>
      <div className="cp-admin-section-heading">
        <div>
          <span className="cp-eyebrow">System health</span>
          <h2>ข้อมูลและบริการที่ต้องดูแล</h2>
          <p>
            ตรวจความสดของ Air4Thai ปัญหาที่ผู้ใช้แจ้ง และสถานะการส่งแจ้งเตือน
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="cp-admin-button cp-focus"
        >
          {loading ? "กำลังโหลด…" : "รีเฟรชสถานะ"}
        </button>
      </div>

      {error && (
        <div role="alert" className="cp-admin-feedback" data-error="true">
          {error}
        </div>
      )}

      <div className="cp-admin-ops-grid">
        <article className="cp-admin-table-card cp-admin-table-card--wide">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ข้อมูล PM2.5 จาก Air4Thai</h3>
              <p>ความสดของสถานีและงานซิงก์รายชั่วโมง</p>
            </div>
            <span
              className="cp-admin-status"
              data-status={
                dataHealth?.status === "healthy" ? "success" : "failed"
              }
            >
              {healthLabel(dataHealth?.status)}
            </span>
          </div>
          <div className="cp-admin-health-grid">
            <div>
              <small>ข้อมูลยังสด</small>
              <strong>
                {dataHealth?.fresh_station_count ?? "—"}/
                {dataHealth?.station_count ?? "—"}
              </strong>
              <span>สถานี</span>
            </div>
            <div>
              <small>ข้อมูลล่าช้า</small>
              <strong>{dataHealth?.delayed_station_count ?? "—"}</strong>
              <span>สถานี</span>
            </div>
            <div>
              <small>หมดอายุ</small>
              <strong>{dataHealth?.expired_station_count ?? "—"}</strong>
              <span>สถานี</span>
            </div>
            <div>
              <small>ซิงก์ล่าสุด</small>
              <strong>{dataHealth?.latest_sync_status ?? "—"}</strong>
              <span>{formatDate(dataHealth?.latest_sync_completed_at)}</span>
            </div>
          </div>
          {!!dataHealth?.alert_codes.length && (
            <div className="cp-admin-attention" role="status">
              ควรตรวจสอบ: {dataHealth.alert_codes.join(", ")}
            </div>
          )}
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ปัญหาข้อมูลจากผู้ใช้</h3>
              <p>รายการที่ส่งถึงผู้ดูแลโดยไม่เปิดเผยภาพหรือพิกัดจริง</p>
            </div>
            <span>{newIssueCount} ใหม่</span>
          </div>
          <DataIssueTriageList
            issues={dataIssues}
            onTransition={onTransitionDataIssue}
          />
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>การส่งแจ้งเตือน</h3>
              <p>สถานะ LINE และ Web Push จากคิวส่งข้อความ</p>
            </div>
            <span>{notificationProblemCount ?? "—"} มีปัญหา</span>
          </div>
          <div className="cp-admin-health-grid cp-admin-health-grid--compact">
            <div>
              <small>รอส่ง</small>
              <strong>{outbox?.pending ?? "—"}</strong>
              <span>รายการ</span>
            </div>
            <div>
              <small>ส่งไม่สำเร็จ</small>
              <strong>{outbox?.failed ?? "—"}</strong>
              <span>รายการ</span>
            </div>
            <div>
              <small>หยุดส่งซ้ำ</small>
              <strong>{outbox?.dead ?? "—"}</strong>
              <span>รายการ</span>
            </div>
          </div>
          {outbox?.latest_error && (
            <div className="cp-admin-attention">{outbox.latest_error}</div>
          )}
        </article>

        <article className="cp-admin-table-card cp-admin-table-card--wide">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ประวัติการซิงก์ข้อมูล</h3>
              <p>ใช้ตรวจว่า ingestion ทำงานต่อเนื่องตามกำหนด</p>
            </div>
            <span>{runs.length} รายการล่าสุด</span>
          </div>
          <div className="cp-admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>แหล่งข้อมูล</th>
                  <th>เวลา</th>
                  <th>สถานะ</th>
                  <th>จำนวนข้อมูล</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.source}</td>
                    <td>{formatDate(run.completed_at ?? run.started_at)}</td>
                    <td>
                      <span
                        className="cp-admin-status"
                        data-status={run.status}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>
                      {run.reading_count ??
                        run.station_count ??
                        run.fetched_count ??
                        "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && runs.length === 0 && (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มีประวัติการซิงก์ข้อมูล
            </div>
          )}
        </article>

        {isAdmin && (
          <AdminAuditLogList
            logs={auditLogs}
            hasMore={auditHasMore}
            loadingMore={auditLoadingMore}
            onLoadMore={onLoadMoreAuditLogs}
          />
        )}
      </div>
    </section>
  );
}
