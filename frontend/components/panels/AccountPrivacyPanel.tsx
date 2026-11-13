"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SettingsLink from "@/frontend/components/app/SettingsLink";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api, ApiError, apiErrorMessage } from "@/frontend/lib/api-client";
import { clearAccountData } from "@/frontend/lib/account-data-cache";
import type { AccountPrivacyStatus } from "@/frontend/types/account-privacy";
import styles from "./AccountPrivacyPanel.module.css";

export default function AccountPrivacyPanel() {
  const auth = useAuth();
  const [outcome, setOutcome] = useState<"completed" | "processing" | null>(
    null,
  );
  if (outcome)
    return (
      <section className={styles.panel} aria-label="จัดการข้อมูลบัญชี">
        <div className={styles.notice} role="status">
          <AppIcon name="check" size={22} />
          <div>
            <h3>
              {outcome === "completed"
                ? auth.localDemo
                  ? "สาธิตการลบบัญชีสำเร็จ"
                  : "ลบบัญชี ClearPath แล้ว"
                : "กำลังดำเนินการลบบัญชี"}
            </h3>
            <p>
              {outcome === "completed"
                ? "รายงานและประวัติการตรวจสอบที่เก็บตามนโยบายจะไม่แสดงตัวตนของคุณ"
                : "บัญชีถูกปิดการใช้งานแล้ว ระบบจะดำเนินการต่อโดยอัตโนมัติ"}
            </p>
            <Link href="/" className={`${styles.secondary} cp-focus`}>
              กลับไปแผนที่
            </Link>
          </div>
        </div>
      </section>
    );
  const subject = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  return (
    <PrivacyContent
      key={subject}
      signedIn={subject !== "guest"}
      onAccepted={setOutcome}
    />
  );
}

function PrivacyContent({
  signedIn,
  onAccepted,
}: {
  signedIn: boolean;
  onAccepted: (state: "completed" | "processing") => void;
}) {
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
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [action, setAction] = useState<"delete" | "signin" | null>(null);
  const busy = action !== null;
  const [loadError, setLoadError] = useState("");
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
          setLoadError("");
        }
      })
      .catch((e) => {
        if (active)
          setLoadError(apiErrorMessage(e, "โหลดการจัดการบัญชีไม่สำเร็จ"));
      });
    return () => {
      active = false;
    };
  }, [signedIn, revision]);

  async function request(event: React.FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== "ลบบัญชี" || !acknowledged) return;
    if (!status?.enabled || pending) return;
    setNeedsSignIn(false);
    setAction("delete");
    setError("");
    try {
      const submitted = await api.requestDeletion({
        confirmation: "ลบบัญชี",
        acknowledges_retention: true,
      });
      if (!alive.current) return;
      clearAccountData(true);
      onAccepted(submitted.status === "completed" ? "completed" : "processing");
      // Auth has already been removed (or blocked pending retry). Clear the
      // local session even when the remote logout endpoint no longer accepts it.
      await auth.signOut({ localOnly: true }).catch(() => undefined);
    } catch (e) {
      if (alive.current) {
        setNeedsSignIn(
          e instanceof ApiError &&
            e.status === 403 &&
            e.message === "กรุณาเข้าสู่ระบบใหม่ก่อนจัดการข้อมูลบัญชี",
        );
        setError(apiErrorMessage(e, "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่"));
      }
    } finally {
      if (alive.current) setAction(null);
    }
  }
  const pending = status?.requests.find(
    (r) => r.status === "pending" || r.status === "processing",
  );
  async function signIn() {
    if (busy) return;
    setAction("signin");
    setError("");
    try {
      await auth.signInWithGoogle("/settings/privacy");
    } catch (e) {
      if (alive.current)
        setError(apiErrorMessage(e, "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      if (alive.current) setAction(null);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-label="จัดการข้อมูลบัญชี"
      aria-busy={busy}
    >
      <SettingsLink
        href="/settings"
        replace
        data-safe-back
        className={`${styles.back} cp-focus`}
      >
        <AppIcon name="back" size={18} /> กลับไปการตั้งค่า
      </SettingsLink>

      {auth.loading ? (
        <div className={styles.notice} role="status">
          <AppIcon name="clock" size={20} />
          <div>
            <h3>กำลังตรวจสอบบัญชี</h3>
            <p>รอสักครู่เพื่อแสดงรายการที่คุณจัดการได้</p>
          </div>
        </div>
      ) : !signedIn ? (
        <div className={styles.notice}>
          <AppIcon name="user" size={22} />
          <div>
            <h3>เข้าสู่ระบบเพื่อจัดการบัญชี</h3>
            <p>ใช้บัญชี Google ที่คุณใช้กับ ClearPath</p>
            <button
              type="button"
              className={`${styles.primary} cp-focus`}
              disabled={busy}
              onClick={() => void signIn()}
            >
              {action === "signin"
                ? "กำลังเข้าสู่ระบบ…"
                : "เข้าสู่ระบบด้วย Google"}
            </button>
          </div>
        </div>
      ) : loadError ? (
        <div className={`${styles.notice} ${styles.failure}`} role="alert">
          <AppIcon name="alert" size={22} />
          <div>
            <h3>ยังโหลดข้อมูลบัญชีไม่ได้</h3>
            <p>{loadError}</p>
            <button
              type="button"
              className={`${styles.secondary} cp-focus`}
              disabled={busy}
              onClick={() => {
                setLoadError("");
                retry((v) => v + 1);
              }}
            >
              ลองโหลดใหม่
            </button>
          </div>
        </div>
      ) : !status ? (
        <div className={styles.notice} role="status">
          <AppIcon name="clock" size={22} />
          <div>
            <h3>กำลังโหลดข้อมูลบัญชี</h3>
            <p>กำลังตรวจสอบบริการและคำขอของคุณ</p>
          </div>
        </div>
      ) : !status.enabled ? (
        <div className={styles.notice} role="status">
          <AppIcon name="info" size={22} />
          <div>
            <h3>การส่งคำขอลบบัญชียังไม่เปิดใช้งาน</h3>
            <p>คุณยังใช้งานบัญชีได้ตามปกติ</p>
            <button
              type="button"
              className={`${styles.textButton} cp-focus`}
              onClick={() => {
                setStatus(null);
                retry((v) => v + 1);
              }}
            >
              <AppIcon name="refresh" size={16} /> ตรวจสอบสถานะอีกครั้ง
            </button>
          </div>
        </div>
      ) : (
        <>
          <section
            className={styles.section}
            aria-labelledby="account-delete-title"
          >
            <div className={styles.sectionTitle}>
              <AppIcon name="user" size={21} />
              <h3 id="account-delete-title">คำขอลบบัญชี</h3>
            </div>
            <p>ลบบัญชีและข้อมูลตั้งค่าส่วนตัว การดำเนินการนี้ย้อนกลับไม่ได้</p>
            {pending ? (
              <div className={styles.pending} role="status">
                <AppIcon name="clock" size={20} />
                <div>
                  <strong>
                    รับคำขอแล้ว ·{" "}
                    {pending.status === "processing"
                      ? "อยู่ระหว่างดำเนินการ"
                      : "กำลังดำเนินการ"}
                  </strong>
                  <p>ระบบจะดำเนินการต่อโดยอัตโนมัติ</p>
                </div>
              </div>
            ) : (
              <details className={styles.deleteDetails}>
                <summary className="cp-focus">
                  ส่งคำขอลบบัญชี <AppIcon name="chevron" size={18} />
                </summary>
                <form onSubmit={request}>
                  <p className={styles.note}>
                    รายงานและประวัติคะแนนจะปิดบังตัวตน
                    ส่วนหลักฐานการตรวจสอบเก็บตามนโยบายเดิม
                  </p>
                  <label>
                    พิมพ์ “ลบบัญชี” เพื่อยืนยัน
                    <input
                      value={confirmation}
                      name="confirmation"
                      autoComplete="off"
                      disabled={busy}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      disabled={busy}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>
                      รับทราบว่ากู้คืนบัญชีไม่ได้
                      และรายงานกับหลักฐานบางส่วนจะเก็บตามนโยบายโดยไม่แสดงตัวตน
                    </span>
                  </label>
                  <button
                    type="submit"
                    className={`${styles.danger} cp-focus`}
                    disabled={
                      busy || !acknowledged || confirmation !== "ลบบัญชี"
                    }
                  >
                    {action === "delete" ? "กำลังส่งคำขอ…" : "ยืนยันส่งคำขอ"}
                  </button>
                </form>
              </details>
            )}
          </section>
        </>
      )}
      {error && (
        <div className={`${styles.feedback} ${styles.failure}`} role="alert">
          <AppIcon name="alert" size={20} />
          <div>
            <p>{error}</p>
            {needsSignIn && (
              <button
                type="button"
                className={`${styles.secondary} cp-focus`}
                disabled={busy}
                onClick={() => void signIn()}
              >
                {action === "signin"
                  ? "กำลังเข้าสู่ระบบ…"
                  : "ยืนยันตัวตนด้วย Google"}
              </button>
            )}
          </div>
        </div>
      )}
      <Link href="/privacy" className={`${styles.policy} cp-focus`}>
        นโยบายความเป็นส่วนตัว
      </Link>
    </section>
  );
}
