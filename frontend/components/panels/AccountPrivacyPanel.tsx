"use client";

import { useEffect, useRef, useState } from "react";
import SettingsLink from "@/frontend/components/app/SettingsLink";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { AccountPrivacyStatus } from "@/frontend/types/account-privacy";
import styles from "./AccountPrivacyPanel.module.css";

export default function AccountPrivacyPanel() {
  const auth = useAuth();
  const subject = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  return <PrivacyContent key={subject} signedIn={subject !== "guest"} />;
}

function PrivacyContent({ signedIn }: { signedIn: boolean }) {
  const auth = useAuth();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [status, setStatus] = useState<AccountPrivacyStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [revision, retry] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void api
      .accountPrivacy()
      .then((data) => {
        if (active) {
          setStatus(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(apiErrorMessage(e, "โหลดการจัดการบัญชีไม่สำเร็จ"));
      });
    return () => {
      active = false;
    };
  }, [signedIn, revision]);

  async function download() {
    if (!status || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sections: Record<string, unknown[]> = {};
      for (const section of status.export_sections) {
        const items: unknown[] = [];
        let offset: number | null = 0;
        for (let page = 0; offset !== null; page++) {
          if (page >= 100) throw new Error("export limit");
          const result = await api.accountExport(section, offset);
          if (!alive.current) return;
          items.push(...result.items);
          if (result.next_offset !== null && result.next_offset <= offset)
            throw new Error("export cursor");
          offset = result.next_offset;
        }
        sections[section] = items;
      }
      if (!alive.current) return;
      const blob = new Blob(
        [
          JSON.stringify(
            {
              generated_at: new Date().toISOString(),
              scope:
                "structured_activity_without_media_binaries_or_other_users",
              sections,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "clearpath-my-activity.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("ดาวน์โหลดข้อมูลกิจกรรมแล้ว ไฟล์นี้มีข้อมูลส่วนตัวของคุณ");
    } catch (e) {
      setError(
        apiErrorMessage(
          e,
          "ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่ ไม่มีการบันทึกไฟล์ที่ไม่ครบ",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function request(event: React.FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== "ลบบัญชี" || !acknowledged) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.requestDeletion({
        confirmation: "ลบบัญชี",
        acknowledges_retention: true,
      });
      setConfirmation("");
      setAcknowledged(false);
      retry((v) => v + 1);
      setMessage("รับคำขอลบบัญชีแล้ว ยังไม่ได้ลบข้อมูลหรือบัญชี");
    } catch (e) {
      setError(apiErrorMessage(e, "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      setBusy(false);
    }
  }
  const pending = status?.requests.find(
    (r) => r.status === "pending" || r.status === "processing",
  );
  return (
    <section className={styles.panel} aria-label="จัดการข้อมูลบัญชี">
      <SettingsLink
        href="/settings"
        replace
        data-safe-back
        className="cp-focus"
      >
        ← กลับไปการตั้งค่า
      </SettingsLink>
      <h2>ข้อมูลบัญชีของคุณ</h2>
      <p>
        ดาวน์โหลดข้อมูลกิจกรรมหรือส่งคำขอลบบัญชี โดยเข้าสู่ระบบใหม่ก่อนทำรายการ
      </p>
      {signedIn && (
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
      )}
      {!signedIn ? (
        <p>กรุณาเข้าสู่ระบบก่อนจัดการข้อมูลบัญชี</p>
      ) : !status ? (
        <p role="status">{error ? "ยังโหลดข้อมูลไม่ได้" : "กำลังโหลด…"}</p>
      ) : !status.enabled ? (
        <p>การจัดการข้อมูลบัญชียังไม่เปิดใช้งาน</p>
      ) : (
        <>
          <section>
            <h3>ดาวน์โหลดข้อมูลกิจกรรม</h3>
            <p>
              ไฟล์ JSON ของรายงาน คะแนน พื้นที่ที่บันทึก คำขอ ความคิดเห็น
              และแจ้งเตือนของคุณ ไม่รวมไฟล์รูปภาพหรือข้อมูลผู้ใช้อื่น
            </p>
            <button
              className="cp-focus"
              type="button"
              disabled={busy}
              onClick={() => void download()}
            >
              {busy ? "กำลังดำเนินการ…" : "ดาวน์โหลดข้อมูล JSON"}
            </button>
          </section>
          <section>
            <h3>คำขอลบบัญชี</h3>
            <p>
              การส่งคำขอยังไม่ลบบัญชีทันที ต้องตรวจยืนยันตัวตนและข้อมูล
              audit/คะแนนที่ต้องเก็บตามนโยบายก่อนดำเนินการ
            </p>
            {pending ? (
              <p role="status">
                รับคำขอแล้ว ·{" "}
                {pending.status === "processing"
                  ? "อยู่ระหว่างดำเนินการ"
                  : "รอตรวจยืนยัน"}
              </p>
            ) : (
              <details>
                <summary className="cp-focus">ส่งคำขอลบบัญชี</summary>
                <form onSubmit={request}>
                  <label>
                    พิมพ์ “ลบบัญชี” เพื่อยืนยัน
                    <input
                      value={confirmation}
                      name="confirmation"
                      autoComplete="off"
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    รับทราบว่าคำขอยังไม่ใช่การลบเสร็จ และอาจต้องเก็บข้อมูล audit
                    ตามนโยบาย
                  </label>
                  <button
                    type="submit"
                    className="cp-focus"
                    disabled={
                      busy || !acknowledged || confirmation !== "ลบบัญชี"
                    }
                  >
                    ยืนยันส่งคำขอ
                  </button>
                </form>
              </details>
            )}
          </section>
        </>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="cp-focus"
            disabled={busy}
            onClick={() => retry((v) => v + 1)}
          >
            ลองโหลดใหม่
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
