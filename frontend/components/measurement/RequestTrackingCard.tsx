"use client";

import Link from "next/link";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { useMeasurementRequests } from "@/frontend/hooks/useMeasurementRequests";

const formatTime = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function RequestTrackingCard({
  userId,
}: {
  userId: string | null;
}) {
  const requestData = useMeasurementRequests(userId);
  const data = { rows: requestData.rows, now: requestData.now };
  const own = (data?.rows ?? [])
    .filter((row) => row.is_owner)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const open = own.filter(
    (row) => row.status === "scheduled" || row.status === "active",
  );
  const row = open[0] ?? own[0];
  const failed = requestData.failed;
  if (!row)
    return (
      <Link href="/requests" className="cp-measure-entry cp-focus">
        <span>
          <strong>ติดตามคำขอค่าฝุ่น</strong>
          <small>
            {failed
              ? "อัปเดตสถานะไม่สำเร็จ · แตะเพื่อลองอีกครั้ง"
              : "คำขอของฉันและคำขอให้ช่วยวัด"}
          </small>
        </span>
        <span aria-hidden="true">→</span>
      </Link>
    );

  const ended = row.status === "expired" || row.status === "cancelled";
  const awaitingSummary =
    row.status === "active" && data && Date.parse(row.expires_at) <= data.now;
  const step = row.status === "fulfilled" ? 2 : row.status === "active" ? 1 : 0;
  const title =
    row.status === "fulfilled"
      ? "ได้รับค่าฝุ่นแล้ว"
      : row.status === "expired"
        ? "หมดเวลา · ยังไม่มีคำตอบ"
        : row.status === "cancelled"
          ? "ยกเลิกคำขอแล้ว"
          : row.status === "scheduled"
            ? "รอเวลาเริ่มขอ"
            : awaitingSummary
              ? "หมดเวลารับรายงาน · กำลังสรุปผล"
              : row.recipient_count > 0
                ? "แจ้งผู้ช่วยแล้ว · กำลังรอรายงาน"
                : "ส่งคำขอแล้ว · กำลังหาผู้ช่วย";
  return (
    <section
      className="cp-request-tracking"
      data-status={row.status}
      aria-label="สถานะคำขอค่าฝุ่น"
    >
      <div className="cp-request-tracking__heading">
        <span>ติดตามคำขอค่าฝุ่น</span>
        <Link className="cp-request-tracking__all cp-focus" href="/requests">
          {open.length > 1 ? `ดูทั้งหมด (${open.length})` : "ดูทั้งหมด"} →
        </Link>
      </div>
      <Link
        className="cp-request-tracking__main cp-focus"
        href={`/requests/${row.id}`}
      >
        <strong
          className="cp-request-tracking__status"
          role="status"
          aria-live="polite"
        >
          {title}
        </strong>
        <span className="cp-request-tracking__place">
          {row.place_name} · วง {row.radius_km} กม.
        </span>
        {row.status === "fulfilled" && row.result?.pm25 != null ? (
          <span className="cp-request-tracking__reading">
            <b style={{ color: classifyPm25(row.result.pm25).color }}>
              {row.result.pm25}
            </b>{" "}
            µg/m³ <small>วัดเมื่อ {formatTime(row.result.captured_at)}</small>
          </span>
        ) : row.status === "fulfilled" ? (
          <small>รายงานที่ตอบคำขอนี้ไม่เปิดเผยแล้ว</small>
        ) : row.status === "scheduled" ? (
          <small>เริ่มขอ {formatTime(row.starts_at)}</small>
        ) : null}
        {!ended && (
          <ol
            className="cp-request-tracking__steps"
            aria-label="ความคืบหน้าคำขอ"
          >
            {["ส่งคำขอ", "รอรายงาน", "ได้รับค่า"].map((label, index) => (
              <li
                key={label}
                data-complete={index < step || row.status === "fulfilled"}
                aria-current={index === step ? "step" : undefined}
              >
                <span>{label}</span>
              </li>
            ))}
          </ol>
        )}
        {failed && (
          <small className="cp-request-tracking__error">
            อัปเดตไม่สำเร็จ · แสดงสถานะล่าสุดที่โหลดได้
          </small>
        )}
      </Link>
    </section>
  );
}
