import type { ReporterTrust } from "@/frontend/types/evidence";
import ReporterAuditReview from "./ReporterAuditReview";
import styles from "./ReporterTrustCard.module.css";

export default function ReporterTrustCard({
  trust,
  compact = false,
  reviewable = false,
}: {
  trust?: ReporterTrust | null;
  compact?: boolean;
  reviewable?: boolean;
}) {
  if (!trust) return null;
  const evaluated = trust.status === "evaluated" && trust.score != null;
  const label =
    trust.status === "unavailable"
      ? "ยังโหลดผลตรวจไม่ได้"
      : evaluated
        ? `${trust.score!.toLocaleString("th-TH", { maximumFractionDigits: 1 })}/100 · ตรวจแล้ว ${trust.evaluated} เคส`
        : "ยังไม่มีผลตรวจเพียงพอ";
  if (compact)
    return (
      <span className={styles.compact}>
        ผลตรวจอิสระผู้รายงาน · {label}
        {trust.validation_status === "candidate" ? " · ทดลอง" : ""}
      </span>
    );
  return (
    <section className={styles.panel} aria-label="ผลตรวจอิสระผู้รายงาน">
      <h3>
        ผลตรวจอิสระผู้รายงาน{" "}
        {trust.validation_status === "candidate" && (
          <span className={styles.candidate}>ทดลอง</span>
        )}
      </h3>
      <p className={styles.score}>{label}</p>
      <p>ประวัติการรายงานจากผลตรวจอิสระ แยกจากคะแนนสะสมและคุณภาพเครื่องวัด</p>
      {(trust.evaluated > 0 || trust.unresolved > 0) && (
        <p>
          ผ่าน {trust.passed} · พบปัญหา {trust.problems} · ยังสรุปไม่ได้{" "}
          {trust.unresolved}
        </p>
      )}
      <details>
        <summary className="cp-focus">คะแนนนี้คำนวณอย่างไร</summary>
        <p>
          ใช้เคสตรวจอิสระที่สรุปผลแล้ว
          โดยปรับค่าตั้งต้นเพื่อไม่ให้ผลตรวจครั้งเดียวได้ 0 หรือ 100 ทันที
          เคสจากการวัดเดียวกันนับครั้งเดียว
        </p>
        <p>สูตร: 100 × (เคสผ่าน + 2) ÷ (เคสผ่าน + เคสพบปัญหา + 4)</p>
        <p>
          OCR ผ่าน ยอดถูกใจ และจำนวนรายงานไม่เพิ่มคะแนนผลตรวจอิสระนี้
          คะแนนนี้ไม่ใช่เปอร์เซ็นต์ที่ค่าฝุ่นถูกต้อง
        </p>
        {trust.validation_status === "candidate" && (
          <p>
            สูตรอยู่ระหว่างประเมิน ยังไม่ใช้เป็นเงื่อนไขตัดสินข้อมูลอัตโนมัติ
          </p>
        )}
        {trust.last_checked_at && (
          <p>
            ผลตรวจล่าสุด{" "}
            <time dateTime={trust.last_checked_at}>
              {new Intl.DateTimeFormat("th-TH", {
                timeZone: "Asia/Bangkok",
                dateStyle: "medium",
              }).format(new Date(trust.last_checked_at))}
            </time>
          </p>
        )}
      </details>
      {reviewable && <ReporterAuditReview />}
    </section>
  );
}
