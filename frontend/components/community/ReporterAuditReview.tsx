"use client";

import { useEffect, useRef, useState } from "react";
import {
  useCurrentUserId,
  useAuth,
} from "@/frontend/components/auth/AuthProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { ReporterAuditView } from "@/frontend/types/evidence";
import styles from "./ReporterTrustCard.module.css";

export default function ReporterAuditReview() {
  const user = useCurrentUserId();
  return user ? <Review key={user} /> : null;
}
function Review() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReporterAuditView[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedAudit = rows.find((row) => row.audit_key === selected);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load(offset = 0) {
    setBusy(true);
    setError("");
    try {
      const result = await api.reporterAudits(offset);
      if (!alive.current) return;
      setRows((old) => (offset ? [...old, ...result.audits] : result.audits));
      setNext(result.next_offset);
      setLoaded(true);
    } catch (e) {
      if (alive.current) setError(apiErrorMessage(e, "โหลดผลตรวจไม่สำเร็จ"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected || reason.trim().length < 10) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.requestTrustReview({
        audit_key: selected,
        message: reason.trim(),
      });
      if (alive.current) {
        setReason("");
        setMessage(
          "รับคำขอทบทวนแล้ว คะแนนจะเปลี่ยนเมื่อมีผลตรวจอิสระฉบับใหม่เท่านั้น",
        );
      }
    } catch (e) {
      if (alive.current) setError(apiErrorMessage(e, "ส่งคำขอทบทวนไม่สำเร็จ"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <details
      className={styles.history}
      open={open}
      onToggle={(event) => {
        const expanded = event.currentTarget.open;
        setOpen(expanded);
        if (expanded && !loaded && !busy) void load();
      }}
    >
      <summary className="cp-focus">ผลตรวจของฉันและขอทบทวน</summary>
      {loaded && rows.length === 0 && <p>ยังไม่มีผลตรวจอิสระของคุณ</p>}
      {rows.length > 0 && (
        <form onSubmit={send}>
          <label>
            เลือกผลตรวจ
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">เลือกผลตรวจที่ต้องการทบทวน</option>
              {rows.map((row) => (
                <option key={row.audit_key} value={row.audit_key}>
                  {row.report_id} ·{" "}
                  {row.outcome === "pass"
                    ? "ผ่าน"
                    : row.outcome === "problem"
                      ? "พบปัญหา"
                      : "ยังสรุปไม่ได้"}{" "}
                  · ฉบับ {row.revision}
                </option>
              ))}
            </select>
          </label>
          {selectedAudit && (
            <p>
              ผลตรวจเมื่อ{" "}
              {new Intl.DateTimeFormat("th-TH", {
                timeZone: "Asia/Bangkok",
                dateStyle: "medium",
              }).format(new Date(selectedAudit.evaluated_at))}
              {selectedAudit.fault_domain !== "reporting" &&
                " · ผลเกี่ยวกับเครื่อง ระบบ หรือยังระบุสาเหตุไม่ได้ ไม่นำมาคิด Trust ผู้รายงาน"}
            </p>
          )}
          {next !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void load(next)}
            >
              ดูผลตรวจเพิ่มเติม
            </button>
          )}
          <label>
            เหตุผลและหลักฐานที่ควรตรวจเพิ่มเติม
            <textarea
              value={reason}
              name="review-reason"
              minLength={10}
              maxLength={1000}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p>
            เข้าสู่ระบบใหม่ก่อนส่งคำขอ
            และอย่าใส่รหัสผ่านหรือข้อมูลติดต่อของผู้อื่น
          </p>
          <button
            type="button"
            className="cp-focus"
            disabled={busy}
            onClick={() =>
              void auth
                .signInWithGoogle()
                .catch((e) =>
                  setError(apiErrorMessage(e, "เข้าสู่ระบบไม่สำเร็จ")),
                )
            }
          >
            ยืนยันตัวตนด้วย Google
          </button>
          <button
            type="submit"
            className="cp-focus"
            disabled={busy || !selected || reason.trim().length < 10}
          >
            ส่งคำขอทบทวน
          </button>
        </form>
      )}
      {busy && <p role="status">กำลังดำเนินการ…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy} onClick={() => void load()}>
            ลองโหลดใหม่
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
