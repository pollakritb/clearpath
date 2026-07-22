import type {
  AdminSyncRun,
  ForecastModelStatus,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function reasonLabel(reason: string | null): string {
  const labels: Record<string, string> = {
    ml_forecast_disabled: "ปิดการใช้งาน ML",
    artifact_not_found: "ยังไม่มีไฟล์โมเดล",
    artifact_invalid: "ไฟล์โมเดลไม่ถูกต้อง",
  };
  return reason ? (labels[reason] ?? reason) : "พร้อมใช้งาน";
}

export default function AdminOperationsPanel({
  runs,
  models,
  outbox,
  loading,
  error,
  onRefresh,
}: {
  runs: AdminSyncRun[];
  models: ForecastModelStatus[];
  outbox: NotificationOutboxSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section>
      <div className="cp-admin-section-heading">
        <div>
          <span className="cp-eyebrow">System operations</span>
          <h2>สถานะข้อมูลและโมเดลพยากรณ์</h2>
          <p>ตรวจสอบการดึง Air4Thai รายชั่วโมงและ activation gate ของโมเดล</p>
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
        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ประวัติ Air4Thai sync</h3>
              <p>รายการล่าสุดจาก cron รายชั่วโมง</p>
            </div>
            <span>{runs.length} รายการ</span>
          </div>
          <div className="cp-admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เริ่มทำงาน</th>
                  <th>สถานะ</th>
                  <th>สถานี</th>
                  <th>ค่าที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDate(run.started_at)}</td>
                    <td>
                      <span
                        className="cp-admin-status"
                        data-status={run.status}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>{run.station_count ?? run.fetched_count ?? "—"}</td>
                    <td>{run.reading_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && runs.length === 0 && (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มีประวัติ sync ในระบบ
            </div>
          )}
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>โมเดลพยากรณ์</h3>
              <p>ตรวจแยกตามช่วงเวลาพยากรณ์</p>
            </div>
          </div>
          <div className="cp-admin-model-list">
            {models.map((model) => (
              <div key={model.horizon_hours} className="cp-admin-model-row">
                <span className="cp-admin-model-row__horizon">
                  {model.horizon_hours}h
                </span>
                <span>
                  <strong>
                    {model.active ? `Model ${model.version}` : "Baseline mode"}
                  </strong>
                  <small>{reasonLabel(model.reason)}</small>
                </span>
                <span
                  className="cp-admin-status"
                  data-status={model.active ? "success" : "inactive"}
                >
                  {model.active ? "active" : "fallback"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>คิว Web Push</h3>
              <p>Outbox ที่รอส่งและรายการที่ส่งไม่สำเร็จ</p>
            </div>
            <span>
              {outbox ? `${outbox.pending + outbox.failed} รอส่ง` : "—"}
            </span>
          </div>
          <div className="cp-admin-model-list">
            <div className="cp-admin-model-row">
              <span className="cp-admin-model-row__horizon">รอ</span>
              <span>
                <strong>{outbox?.pending ?? "—"} รายการ</strong>
                <small>เก่าสุด {formatDate(outbox?.oldest_waiting_at)}</small>
              </span>
              <span className="cp-admin-status" data-status="running">
                pending
              </span>
            </div>
            <div className="cp-admin-model-row">
              <span className="cp-admin-model-row__horizon">ผิด</span>
              <span>
                <strong>{outbox?.failed ?? "—"} รายการ</strong>
                <small>{outbox?.latest_error ?? "ไม่พบข้อผิดพลาดล่าสุด"}</small>
              </span>
              <span
                className="cp-admin-status"
                data-status={outbox?.failed ? "failed" : "success"}
              >
                {outbox?.failed ? "failed" : "healthy"}
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
