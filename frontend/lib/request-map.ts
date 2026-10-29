import type { MeasurementRequestView, RequestStatus } from "@/frontend/types";

export const REQUEST_MARKER_STATES: Record<
  RequestStatus,
  { color: string; label: string; symbol: string }
> = {
  scheduled: { color: "#7650b4", label: "รอเริ่มขอ", symbol: "◷" },
  active: { color: "#087c76", label: "รอรายงาน", symbol: "?" },
  fulfilled: { color: "#25834a", label: "ได้รับค่าแล้ว", symbol: "✓" },
  expired: { color: "#697b76", label: "หมดเวลา", symbol: "—" },
  cancelled: { color: "#697b76", label: "ยกเลิกแล้ว", symbol: "×" },
};

export function requestMapStatus(
  row: MeasurementRequestView,
  now: number,
): RequestStatus {
  return (row.status === "active" || row.status === "scheduled") &&
    Date.parse(row.expires_at) <= now
    ? "expired"
    : row.status === "scheduled" && Date.parse(row.starts_at) <= now
      ? "active"
      : row.status;
}

export function visibleMapRequests(
  rows: MeasurementRequestView[],
  now: number,
  selectedId?: string | null,
) {
  return rows.filter((row) => {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
    const expires = Date.parse(row.expires_at);
    const state = requestMapStatus(row, now);
    if (
      !Number.isFinite(expires) ||
      expires <= now ||
      state === "expired" ||
      state === "cancelled"
    )
      return false;
    if (row.id === selectedId) return true;
    return state === "active" || state === "scheduled" || state === "fulfilled";
  });
}
