"use client";

import { useEffect, useMemo, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  LineLinkCodeResponse,
  LineNotificationStatus,
} from "@/frontend/types";

const STATUS_POLL_MS = 3_000;

export default function LineNotificationCard() {
  const [status, setStatus] = useState<LineNotificationStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LineLinkCodeResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .lineNotificationStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(apiErrorMessage(cause, "อ่านสถานะ LINE ไม่สำเร็จ"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!linkCode || status?.linked) return;
    const expiresAt = Date.parse(linkCode.expires_at);
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) {
        window.clearInterval(timer);
        return;
      }
      void api
        .lineNotificationStatus()
        .then((next) => {
          setStatus(next);
          if (next.linked) {
            setLinkCode(null);
            setMessage("เชื่อม LINE สำเร็จแล้ว");
          }
        })
        .catch(() => undefined);
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [linkCode, status?.linked]);

  const remainingSeconds = useMemo(() => {
    if (!linkCode) return 0;
    return Math.max(
      0,
      Math.ceil((Date.parse(linkCode.expires_at) - now) / 1000),
    );
  }, [linkCode, now]);

  async function createCode() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const next = await api.createLineLinkCode();
      setLinkCode(next);
      setNow(Date.now());
    } catch (cause) {
      setError(apiErrorMessage(cause, "สร้างรหัส LINE ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode.code);
      setCopied(true);
      setMessage("คัดลอกรหัสแล้ว นำไปส่งในแชต ClearPath บน LINE");
    } catch {
      setError("คัดลอกอัตโนมัติไม่ได้ กรุณาแตะค้างที่รหัสแล้วคัดลอก");
    }
  }

  async function testLine() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.testLineNotification();
      setMessage(result.message);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งข้อความทดสอบไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.disconnectLine();
      setStatus((current) =>
        current ? { ...current, linked: false, linked_at: null } : current,
      );
      setLinkCode(null);
      setMessage(result.message);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ยกเลิก LINE ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cp-line-link" aria-labelledby="line-notification-title">
      <header className="cp-line-link__header">
        <span className="cp-line-link__brand" aria-hidden="true">
          <AppIcon name="line" size={23} />
        </span>
        <span>
          <h3 id="line-notification-title">แจ้งเตือนผ่าน LINE</h3>
          <small>รับข้อความได้แม้ไม่ได้เปิด ClearPath ค้างไว้</small>
        </span>
        <span
          className="cp-line-link__status"
          data-linked={status?.linked ?? false}
        >
          {status === null
            ? "กำลังตรวจ"
            : status.linked
              ? "เชื่อมแล้ว"
              : "ยังไม่เชื่อม"}
        </span>
      </header>

      {status === null ? (
        <p>กำลังตรวจสถานะ LINE…</p>
      ) : !status.enabled ? (
        <p className="cp-line-link__notice">
          ระบบ LINE ยังรอการเปิดใช้งาน Official Account โดยผู้ดูแลระบบ
        </p>
      ) : status.linked ? (
        <div className="cp-line-link__connected">
          <p>
            <AppIcon name="check" size={17} />
            บัญชีนี้พร้อมรับ PM2.5 จุดความร้อน และสถานะรายงานตามเกณฑ์ที่เลือก
          </p>
          {status.linked_at && (
            <small>เชื่อมเมื่อ {formatDateTime(status.linked_at)}</small>
          )}
          <div className="cp-line-link__actions">
            <button
              type="button"
              className="cp-focus cp-line-link__primary"
              disabled={busy}
              onClick={() => void testLine()}
            >
              <AppIcon name="send" size={17} />
              ส่งข้อความทดสอบ
            </button>
            <button
              type="button"
              className="cp-focus cp-line-link__secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              ยกเลิกการเชื่อม
            </button>
          </div>
        </div>
      ) : (
        <div className="cp-line-link__steps">
          <p>
            <b>1</b> เพิ่มเพื่อนบัญชี ClearPath Official
          </p>
          {status.official_account_url ? (
            <a
              href={status.official_account_url}
              target="_blank"
              rel="noreferrer"
              className="cp-focus cp-line-link__primary"
            >
              <AppIcon name="line" size={18} />
              เปิด ClearPath ใน LINE
            </a>
          ) : (
            <small>ยังไม่มีลิงก์เพิ่มเพื่อน กรุณาติดต่อผู้ดูแลระบบ</small>
          )}
          <p>
            <b>2</b> สร้างรหัสสำหรับบัญชีนี้
          </p>
          <button
            type="button"
            className="cp-focus cp-line-link__secondary"
            disabled={busy}
            onClick={() => void createCode()}
          >
            สร้างรหัสเชื่อมบัญชี
          </button>
          {linkCode && (
            <div className="cp-line-link__code" role="status">
              <span>รหัสใช้ครั้งเดียว</span>
              <b>{linkCode.code}</b>
              <button
                type="button"
                className="cp-focus"
                disabled={remainingSeconds === 0}
                onClick={() => void copyCode()}
              >
                <AppIcon name={copied ? "check" : "copy"} size={16} />
                {copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
              </button>
              <small>
                {remainingSeconds > 0
                  ? `หมดอายุใน ${formatCountdown(remainingSeconds)}`
                  : "รหัสหมดอายุแล้ว กรุณาสร้างรหัสใหม่"}
              </small>
            </div>
          )}
          <p>
            <b>3</b> ส่งรหัสในแชต LINE ระบบจะตรวจสถานะให้อัตโนมัติ
          </p>
        </div>
      )}

      {message && (
        <p className="cp-line-link__success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="cp-line-link__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} นาที`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
