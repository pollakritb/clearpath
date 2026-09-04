import type {
  AdminSyncRun,
  DataIssueRow,
  ForecastDataQualityRow,
  ForecastEvaluationRow,
  ForecastFalseSafeCase,
  ForecastFalseSafeReviewRequest,
  ForecastModelStatus,
  ForecastProviderHealthResponse,
  ForecastReleaseDecision,
  NotificationOutboxSummary,
} from "@/frontend/types/ui";

import FalseSafeCaseReviewList from "./FalseSafeCaseReviewList";

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
  dataQuality,
  evaluation,
  dataIssues,
  falseSafeCases,
  releaseDecisions,
  providerHealth,
  loading,
  error,
  onRefresh,
  onReviewFalseSafe,
}: {
  runs: AdminSyncRun[];
  models: ForecastModelStatus[];
  outbox: NotificationOutboxSummary | null;
  dataQuality: ForecastDataQualityRow[];
  evaluation: ForecastEvaluationRow[];
  dataIssues: DataIssueRow[];
  falseSafeCases: ForecastFalseSafeCase[];
  releaseDecisions: ForecastReleaseDecision[];
  providerHealth: ForecastProviderHealthResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onReviewFalseSafe: (
    row: ForecastFalseSafeCase,
    body: ForecastFalseSafeReviewRequest,
  ) => Promise<void>;
}) {
  const qualityTotals = dataQuality.reduce(
    (totals, row) => ({
      expected: totals.expected + row.expected_hours,
      observed: totals.observed + row.observed_hours,
      missing: totals.missing + row.missing_hours,
      invalid: totals.invalid + row.invalid_rows,
      duplicate: totals.duplicate + row.duplicate_hours,
    }),
    { expected: 0, observed: 0, missing: 0, invalid: 0, duplicate: 0 },
  );
  const completeness = qualityTotals.expected
    ? Math.round((qualityTotals.observed / qualityTotals.expected) * 100)
    : null;
  const latestEvaluation = [...evaluation].sort((a, b) =>
    b.computed_at.localeCompare(a.computed_at),
  )[0];
  const comparisons = [1, 3, 6, 12, 24]
    .map((horizon) => {
      const rows = evaluation
        .filter(
          (row) =>
            row.horizon_hours === horizon &&
            row.station_id === "all" &&
            row.district === "all",
        )
        .sort((a, b) => b.evaluation_date.localeCompare(a.evaluation_date));
      const candidate = rows.find((row) => row.method.includes("xgboost"));
      const baseline = rows.find((row) => !row.method.includes("xgboost"));
      return candidate && baseline ? { horizon, candidate, baseline } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

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
        <article className="cp-admin-table-card cp-admin-table-card--wide">
          <div className="cp-admin-card-heading">
            <div>
              <h3>Multi-source consensus ทั่วประเทศ</h3>
              <p>
                coverage, provider errors, disagreement และอิทธิพลข้อมูลชุมชน
              </p>
            </div>
            <span>{providerHealth?.consensus.station_count ?? 0} สถานี</span>
          </div>
          <div className="cp-admin-model-list">
            {(providerHealth?.providers ?? []).map((provider) => (
              <div key={provider.provider} className="cp-admin-model-row">
                <span className="cp-admin-model-row__horizon">
                  {provider.provider === "openmeteo_cams"
                    ? "CAMS"
                    : provider.provider === "gistda"
                      ? "GISTDA"
                      : "OWM"}
                </span>
                <span>
                  <strong>{provider.snapshot_count} snapshots</strong>
                  <small>
                    {provider.station_count} สถานี · ผิดพลาด{" "}
                    {provider.error_count} · {formatDate(provider.completed_at)}
                  </small>
                </span>
                <span className="cp-admin-status" data-status={provider.status}>
                  {provider.status}
                </span>
              </div>
            ))}
            <div className="cp-admin-model-row">
              <span className="cp-admin-model-row__horizon">รวม</span>
              <span>
                <strong>
                  หลายแหล่ง{" "}
                  {providerHealth?.consensus.multi_provider_count ?? 0} สถานี
                </strong>
                <small>
                  ชุมชนมีอิทธิพล{" "}
                  {providerHealth?.consensus.community_influenced_count ?? 0} ·
                  agreement ต่ำ{" "}
                  {providerHealth?.consensus.agreement_counts.low ?? 0}
                </small>
              </span>
              <span className="cp-admin-status" data-status="running">
                monitor
              </span>
            </div>
          </div>
          {!providerHealth?.providers.length && (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มี provider sync run — ตรวจ migration, env และ GitHub
              Actions
            </div>
          )}
        </article>
        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>รายการแจ้งข้อมูลผิดพลาด</h3>
              <p>คิว private จากผู้ใช้ ไม่มีภาพหรือพิกัดละเอียด</p>
            </div>
            <span>
              {dataIssues.filter((issue) => issue.status === "new").length} ใหม่
            </span>
          </div>
          {dataIssues.length ? (
            <div className="cp-admin-table-wrap">
              <table>
                <caption>รายการแจ้งข้อมูลผิดพลาดล่าสุด</caption>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ประเภท</th>
                    <th>อ้างอิง</th>
                    <th>รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {dataIssues.slice(0, 10).map((issue) => (
                    <tr key={issue.id}>
                      <td>{formatDate(issue.created_at)}</td>
                      <td>{issue.category}</td>
                      <td>{issue.reference_id ?? "—"}</td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มีผู้ใช้แจ้งข้อมูลผิดพลาด
            </div>
          )}
        </article>

        <article className="cp-admin-table-card cp-admin-table-card--wide">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ตรวจเหตุการณ์ false-safe</h3>
              <p>
                พยากรณ์ว่าปลอดภัยแต่ค่าจริงเข้าสู่ระดับเสี่ยง
                ต้องตรวจทุกเหตุการณ์ก่อนอนุมัติ canary
              </p>
            </div>
            <span>
              {
                falseSafeCases.filter(
                  (row) => !row.forecast_false_safe_reviews?.length,
                ).length
              }{" "}
              ยังไม่ตรวจ
            </span>
          </div>
          {falseSafeCases.length ? (
            <FalseSafeCaseReviewList
              rows={falseSafeCases}
              onReview={onReviewFalseSafe}
            />
          ) : (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มีเหตุการณ์ false-safe ที่ settle ใน 30 วัน
              ต้องรอข้อมูลจริงก่อนยืนยัน release gate นี้
            </div>
          )}
        </article>

        <article className="cp-admin-table-card cp-admin-table-card--wide">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ประวัติการตัดสินใจ release</h3>
              <p>
                หลักฐาน audit ของ shadow, canary, promote, rollback และ reject
              </p>
            </div>
            <span>{releaseDecisions.length} รายการ</span>
          </div>
          {releaseDecisions.length ? (
            <div className="cp-admin-release-list">
              {releaseDecisions.slice(0, 20).map((item) => (
                <div key={item.id} className="cp-admin-release-row">
                  <span
                    className="cp-admin-status"
                    data-status={
                      item.decision === "reject" || item.decision === "rollback"
                        ? "failed"
                        : "success"
                    }
                  >
                    {item.decision}
                  </span>
                  <span>
                    <strong>
                      {item.model_registry
                        ? `${item.model_registry.model_name} ${item.model_registry.horizon_hours}h · ${item.model_registry.version}`
                        : "ไม่พบ registry ที่เชื่อมโยง"}
                    </strong>
                    <small>
                      {item.reason} · {formatDate(item.created_at)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มี release decision จาก production ห้ามถือว่ารุ่นใดผ่าน
              canary
            </div>
          )}
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ความพร้อมข้อมูลพยากรณ์</h3>
              <p>Reconciliation 7 วัน แยก source / สถานี / ชั่วโมง</p>
            </div>
            <span>{completeness === null ? "—" : `${completeness}% ครบ`}</span>
          </div>
          <div className="cp-admin-model-list">
            <div className="cp-admin-model-row">
              <span className="cp-admin-model-row__horizon">ขาด</span>
              <span>
                <strong>{qualityTotals.missing} ชั่วโมง</strong>
                <small>จากที่คาด {qualityTotals.expected} station-hours</small>
              </span>
              <span
                className="cp-admin-status"
                data-status={qualityTotals.missing ? "failed" : "success"}
              >
                {qualityTotals.missing ? "review" : "healthy"}
              </span>
            </div>
            <div className="cp-admin-model-row">
              <span className="cp-admin-model-row__horizon">ผิด</span>
              <span>
                <strong>{qualityTotals.invalid} invalid</strong>
                <small>{qualityTotals.duplicate} ชั่วโมงซ้ำ</small>
              </span>
              <span
                className="cp-admin-status"
                data-status={
                  qualityTotals.invalid || qualityTotals.duplicate
                    ? "failed"
                    : "success"
                }
              >
                {qualityTotals.invalid || qualityTotals.duplicate
                  ? "review"
                  : "healthy"}
              </span>
            </div>
          </div>
          {!loading && dataQuality.length === 0 && (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มี reconciliation จากฐานข้อมูลจริง
            </div>
          )}
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>Candidate เทียบ Baseline</h3>
              <p>ใช้เฉพาะผล settled ช่วงวันเดียวกัน ไม่ใช่คะแนนจาก training</p>
            </div>
            <span>{comparisons.length}/5 horizons</span>
          </div>
          {comparisons.length ? (
            <div className="cp-admin-table-wrap">
              <table>
                <caption>MAE ของ candidate เทียบกับ baseline</caption>
                <thead>
                  <tr>
                    <th>ช่วง</th>
                    <th>Candidate</th>
                    <th>Baseline</th>
                    <th>ต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map(({ horizon, candidate, baseline }) => {
                    const delta =
                      candidate.mae !== null && baseline.mae !== null
                        ? candidate.mae - baseline.mae
                        : null;
                    return (
                      <tr key={horizon}>
                        <th scope="row">{horizon}h</th>
                        <td>{candidate.mae?.toFixed(1) ?? "—"}</td>
                        <td>{baseline.mae?.toFixed(1) ?? "—"}</td>
                        <td>
                          {delta === null
                            ? "—"
                            : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มี candidate และ baseline ที่ settle ในช่วงเดียวกัน
              ห้ามอนุมัติ canary จากช่องว่างนี้
            </div>
          )}
        </article>

        <article className="cp-admin-table-card">
          <div className="cp-admin-card-heading">
            <div>
              <h3>ความแม่นยำที่วัดได้</h3>
              <p>Prediction ledger ที่จับคู่ observation แล้วใน 14 วัน</p>
            </div>
            <span>
              {evaluation.reduce((sum, row) => sum + row.rows, 0)} จุด
            </span>
          </div>
          {latestEvaluation ? (
            <div className="cp-admin-model-list">
              <div className="cp-admin-model-row">
                <span className="cp-admin-model-row__horizon">
                  {latestEvaluation.horizon_hours}h
                </span>
                <span>
                  <strong>
                    MAE {latestEvaluation.mae?.toFixed(1) ?? "—"} µg/m³
                  </strong>
                  <small>
                    false-safe{" "}
                    {latestEvaluation.false_safe_rate === null
                      ? "—"
                      : `${(latestEvaluation.false_safe_rate * 100).toFixed(1)}%`}
                  </small>
                </span>
                <span className="cp-admin-status" data-status="running">
                  measured
                </span>
              </div>
            </div>
          ) : (
            <div className="cp-admin-empty cp-admin-empty--compact">
              ยังไม่มี observation ครบกำหนดสำหรับประเมิน ห้ามสรุปว่าโมเดลผ่าน
            </div>
          )}
        </article>

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
