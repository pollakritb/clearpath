import type { CommunityReport } from "@/frontend/types";

const STATES = {
  verified: "มีข้อมูลรองรับ",
  declared: "ผู้รายงานระบุ",
  invalid: "ข้อมูลขัดแย้ง",
  unknown: "ยังยืนยันไม่ได้",
};
const LABELS: Record<string, string> = {
  number: "อ่านตัวเลข",
  pm25_field_verified: "ช่อง PM2.5",
  unit_verified: "หน่วยวัด",
  provenance: "ที่มาภาพ",
  time: "เวลาขณะส่ง",
  gps: "ตำแหน่ง",
  coherence: "เวลาและตำแหน่งสอดคล้อง",
  context: "บริบทที่ผู้ใช้ระบุ",
};
export default function ReportEvidencePanel({
  report,
}: {
  report: CommunityReport;
}) {
  if (report.evidence_policy !== "evidence-v2") return null;
  const evidence = report.evidence;
  return (
    <section className="cp-evidence-panel" aria-label="คะแนนหลักฐานรายงาน">
      <h3>
        หลักฐานรายงาน{" "}
        {evidence ? `${evidence.score}/100` : "ยังไม่มีข้อมูลรุ่นใหม่"}
      </h3>
      <p>คะแนนความครบถ้วนของหลักฐาน ไม่ใช่เปอร์เซ็นต์ความแม่นยำของค่าฝุ่น</p>
      {evidence && <small>ประเมินจากหลักฐานขณะส่งรายงาน</small>}
      {evidence && (
        <>
          <p>
            เครื่องวัด:{" "}
            {evidence.device_status === "evaluation_available"
              ? "มีหลักฐานประเมินเครื่องในเงื่อนไขที่ระบุ"
              : evidence.device_status === "identified"
                ? "ระบุรุ่นแล้ว · ยังไม่มีผลประเมินอิสระ"
                : "ยังไม่ทราบข้อมูลเครื่อง"}
          </p>
          {evidence.device_evaluated_at &&
            evidence.device_status === "evaluation_available" && (
              <small>
                {evidence.device_method} · ประเมิน{" "}
                {new Date(evidence.device_evaluated_at).toLocaleDateString(
                  "th-TH",
                  { timeZone: "Asia/Bangkok" },
                )}{" "}
                · ใช้ได้ถึง{" "}
                {evidence.device_valid_until
                  ? new Date(evidence.device_valid_until).toLocaleDateString(
                      "th-TH",
                      { timeZone: "Asia/Bangkok" },
                    )
                  : "ไม่ระบุ"}
              </small>
            )}
          <details>
            <summary>ดูองค์ประกอบและสิ่งที่ยังยืนยันไม่ได้</summary>
            <ul>
              {evidence.components.map((check) => (
                <li key={check.code}>
                  <strong>
                    {LABELS[check.code] ?? check.code} · {check.points}/
                    {check.maximum}
                  </strong>
                  <span className="cp-evidence-state" data-state={check.state}>
                    {STATES[check.state]}
                  </span>
                  <span>{check.reason}</span>
                </li>
              ))}
            </ul>
            <p>
              ข้อมูลที่ไม่ทราบยังนับเป็น 0 ในคะแนนเต็ม 100
              ไม่เฉลี่ยใหม่เฉพาะส่วนที่มีข้อมูล
            </p>
          </details>
        </>
      )}
      <div className="cp-evidence-use">
        <strong>การใช้ข้อมูลพื้นที่</strong>
        <p>
          {report.eligible_for_gap_fill
            ? "เข้าเกณฑ์เสริมข้อมูลในพื้นที่ที่ไม่มีสถานีสด"
            : report.eligibility_reason}
        </p>
      </div>
      <small>คะแนนสะสมและปฏิกิริยาของผู้ใช้ไม่เพิ่มคะแนนหลักฐาน</small>
    </section>
  );
}
