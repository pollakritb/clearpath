"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { announceRequestUpdate } from "@/frontend/lib/measurement-events";
import {
  requestPlaceParts,
  UNKNOWN_REQUEST_PLACE,
} from "@/frontend/lib/request-place";
import type { MeasurementRequestView, RequestStatus } from "@/frontend/types";

const RequestAreaMap = dynamic(() => import("./RequestAreaMap"), {
  ssr: false,
});

export const REQUEST_LABELS: Record<RequestStatus, string> = {
  scheduled: "รอถึงเวลาเริ่มขอ",
  active: "กำลังรอผู้ช่วยรายงาน",
  fulfilled: "ได้รับค่าฝุ่นแล้ว",
  expired: "หมดเวลา · ยังไม่มีคำตอบ",
  cancelled: "ยกเลิกแล้ว",
};
const date = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function RequestSummary({
  row,
  actions = false,
  onChanged,
}: {
  row: MeasurementRequestView;
  actions?: boolean;
  onChanged?: (request: MeasurementRequestView) => void;
}) {
  const router = useRouter();
  const [claimDeadline, setClaimDeadline] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const cls = classifyPm25(row.result?.pm25);
  const place = requestPlaceParts(row.place_name);
  const active = row.status === "scheduled" || row.status === "active";
  const minutesLeft = Math.max(
    0,
    Math.ceil((Date.parse(row.expires_at) - now) / 60000),
  );
  async function act(kind: "cancel" | "decline") {
    setBusy(true);
    setError("");
    try {
      const updated =
        kind === "cancel"
          ? await api.cancelMeasurementRequest(row.id)
          : await api.declineMeasurementRequest(row.id);
      onChanged?.(updated);
      announceRequestUpdate(updated);
    } catch (e) {
      setError(apiErrorMessage(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="cp-measure-card" data-status={row.status}>
      <div className="cp-measure-heading">
        <span className="cp-measure-badge">{REQUEST_LABELS[row.status]}</span>
        <small>{row.is_owner ? "คำขอของฉัน" : "คำขอให้ช่วยวัด"}</small>
      </div>
      <h2>{place.title}</h2>
      {place.address && <p>{place.address}</p>}
      {place.title === UNKNOWN_REQUEST_PLACE && (
        <p>
          {row.lat.toFixed(5)}, {row.lon.toFixed(5)}
        </p>
      )}
      <p>
        วง {row.radius_km} กม. · รับรายงาน {date(row.starts_at)} –{" "}
        {date(row.expires_at)}
      </p>
      {row.status !== "cancelled" && (
        <Link
          href={`/?measurement_request=${encodeURIComponent(row.id)}`}
          className="cp-measure-link cp-focus"
        >
          ดูจุดคำขอบนแผนที่
        </Link>
      )}
      {row.status === "cancelled" && (
        <p>ยกเลิกแล้ว · เก็บไว้ในประวัติและไม่แสดงหมุดบนแผนที่</p>
      )}
      {actions && active && (
        <RequestAreaMap lat={row.lat} lon={row.lon} radius={row.radius_km} />
      )}
      {active && (
        <p>
          {minutesLeft > 0
            ? `เหลือเวลารับรายงาน ${minutesLeft} นาที`
            : "หมดเวลารับรายงานแล้ว กำลังสรุปผล"}
        </p>
      )}
      {row.is_owner && active && (
        <p>
          {row.recipient_count
            ? `มีผู้เข้าเกณฑ์รับคำขอ ${row.recipient_count} คน · ไม่ใช่จำนวนที่อ่านแล้ว`
            : "ยังไม่มีผู้เข้าเกณฑ์รับคำขอ ระบบจะตรวจอีกครั้งระหว่างเปิดรับ"}
        </p>
      )}
      {!row.is_owner && row.matched_location_at && (
        <p>
          เลือกคุณจาก GPS เข้าเว็บล่าสุดเมื่อ {date(row.matched_location_at)}{" "}
          ตำแหน่งนี้อาจเปลี่ยนแล้ว
        </p>
      )}
      {row.result && (
        <div
          className="cp-measure-result"
          style={{ background: cls.tint, borderColor: cls.color }}
        >
          <strong style={{ color: cls.color }}>
            {row.result.pm25} <small>µg/m³</small>
          </strong>
          <span>{cls.level}</span>
          <p>
            วัดเมื่อ {date(row.result.captured_at)} · ห่างจากเป้าหมายประมาณ{" "}
            {row.result_distance_km} กม.
          </p>
          <Link href={`/?report=${row.result.id}`}>
            ดูหมุดและรายละเอียดรายงาน
          </Link>
        </div>
      )}
      {row.status === "fulfilled" && !row.result && (
        <p>รายงานที่ตอบคำขอนี้ไม่เปิดเผยแล้ว</p>
      )}
      {row.status === "active" && (
        <small>
          รับเฉพาะรายงานใหม่ที่ผ่านตรวจอัตโนมัติในพื้นที่และช่วงเวลานี้
          ไม่รับประกันว่าจะมีผู้ตอบ
        </small>
      )}
      {!actions ? (
        <div className="cp-measure-actions">
          <Link href={`/requests/${row.id}`} className="cp-measure-link">
            {active ? "ติดตามคำขอ" : "ดูประวัติคำขอ"}
          </Link>
          {row.is_owner && active && (
            <button
              type="button"
              className="cp-request-cancel cp-focus"
              disabled={busy}
              onClick={() => void act("cancel")}
            >
              {busy ? "กำลังยกเลิก…" : "ยกเลิกคำขอ"}
            </button>
          )}
        </div>
      ) : (
        <div className="cp-measure-actions">
          {!row.is_owner &&
            (row.status === "active" ||
              (row.help_claim && Date.parse(row.help_claim.deadline) > now)) &&
            minutesLeft > 0 &&
            !row.declined &&
            (row.xp_enabled ? (
              <button
                type="button"
                className="cp-measure-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const claim = await api.claimMeasurementHelp(row.id);
                    setClaimDeadline(claim.deadline);
                    router.push(`/report?request=${row.id}`);
                  } catch (e) {
                    setError(apiErrorMessage(e, "เริ่มช่วยวัดไม่สำเร็จ"));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {row.help_claim
                  ? "วัดต่อจากภารกิจเดิม · +5 XP"
                  : "ช่วยวัดคำขอนี้ · +5 XP"}
              </button>
            ) : (
              <Link
                href={`/report?request=${row.id}`}
                className="cp-measure-primary"
              >
                ช่วยรายงาน
              </Link>
            ))}
          {!row.is_owner && active && !row.declined && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("decline")}
            >
              ไม่สะดวก
            </button>
          )}
          {row.is_owner && active && (
            <button
              type="button"
              className="cp-request-cancel cp-focus"
              disabled={busy}
              onClick={() => void act("cancel")}
            >
              ยกเลิกคำขอ
            </button>
          )}
          {row.declined && <p>คุณเลือกไม่สะดวกช่วยวัดคำขอนี้แล้ว</p>}
        </div>
      )}
      {claimDeadline && (
        <p role="status">
          เริ่มช่วยวัดแล้ว · ส่งก่อน {date(claimDeadline)} ·
          โบนัสขึ้นกับเงื่อนไข GPS และโควตา
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}

export default function RequestsPage({ requestId }: { requestId?: string }) {
  const router = useRouter();
  const auth = useAuth();
  const login = useLoginPrompt();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const account = auth.user?.id ?? (auth.localDemo ? "local" : "guest");
  const [loaded, setLoaded] = useState<{
    account: string;
    requestId?: string;
    rows: MeasurementRequestView[];
  } | null>(null);
  const rows =
    loaded?.account === account && loaded.requestId === requestId
      ? loaded.rows
      : [];
  const groups = requestId
    ? [{ label: null, items: rows }]
    : [
        {
          label: "คำขอของฉัน",
          items: rows.filter(
            (row) =>
              row.is_owner &&
              (row.status === "active" || row.status === "scheduled"),
          ),
        },
        {
          label: "คำขอจากคนอื่นให้ช่วยวัด",
          items: rows.filter(
            (row) =>
              !row.is_owner &&
              (row.status === "active" || row.status === "scheduled"),
          ),
        },
        {
          label: "ประวัติคำขอ",
          items: rows.filter(
            (row) => row.status !== "active" && row.status !== "scheduled",
          ),
        },
      ];
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const data = requestId
        ? [await api.measurementRequest(requestId)]
        : (await api.measurementRequests()).requests;
      setLoaded({ account, requestId, rows: data });
      setError("");
    } catch (e) {
      setError(apiErrorMessage(e, "โหลดคำขอไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [requestId, signedIn, account]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive && document.visibilityState !== "hidden") void load();
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  return (
    <UserPageShell
      tab="overview"
      icon="community"
      header={{
        title: "ติดตามคำขอค่าฝุ่น",
        description: "คำขอของฉันและคำขอจากคนอื่นที่ส่งถึงคุณ",
        showDataStatus: false,
      }}
    >
      <div className="cp-measure-stack">
        <button
          type="button"
          onClick={() => router.back()}
          className="cp-measure-back cp-focus"
        >
          <span aria-hidden="true">←</span>
          กลับ
        </button>
        {!auth.loading && !auth.user && !auth.localDemo ? (
          <button
            type="button"
            className="cp-measure-primary"
            onClick={() => login.openLoginPrompt()}
          >
            เข้าสู่ระบบเพื่อดูคำขอ
          </button>
        ) : (
          <>
            {loading && <p role="status">กำลังโหลดคำขอ…</p>}
            {error && <p role="alert">{error}</p>}
            {groups.map((group) => (
              <section
                key={group.label ?? "detail"}
                className="cp-measure-stack"
                aria-label={group.label ?? "รายละเอียดคำขอ"}
              >
                {group.label && <h2>{group.label}</h2>}
                {group.items.map((row) => (
                  <RequestSummary
                    key={row.id}
                    row={row}
                    actions={!!requestId}
                    onChanged={(updated) => {
                      setLoaded((previous) =>
                        previous?.account === account
                          ? {
                              ...previous,
                              rows: previous.rows.map((row) =>
                                row.id === updated.id ? updated : row,
                              ),
                            }
                          : previous,
                      );
                      void load();
                    }}
                  />
                ))}
                {!loading && !group.items.length && !error && (
                  <div className="cp-measure-card">
                    <p>
                      {group.label === "คำขอของฉัน"
                        ? "ยังไม่มีคำขอของคุณ"
                        : group.label === "ประวัติคำขอ"
                          ? "ยังไม่มีประวัติคำขอ"
                          : group.label
                            ? "ยังไม่มีคำขอจากคนอื่นที่ส่งถึงคุณ"
                            : "ไม่พบคำขอ"}
                    </p>
                  </div>
                )}
              </section>
            ))}
          </>
        )}
        <Link href="/settings/notifications" className="cp-measure-link">
          ตั้งค่าการรับคำขอและ LINE
        </Link>
      </div>
    </UserPageShell>
  );
}
