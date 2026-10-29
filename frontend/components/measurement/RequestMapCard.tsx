"use client";
import Link from "next/link";
import { useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { announceRequestUpdate } from "@/frontend/lib/measurement-events";
import {
  requestPlaceParts,
  UNKNOWN_REQUEST_PLACE,
} from "@/frontend/lib/request-place";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type { MeasurementRequestView } from "@/frontend/types";
import {
  REQUEST_MARKER_STATES,
  requestMapStatus,
} from "@/frontend/lib/request-map";

export default function RequestMapCard({
  request,
  now,
  onClose,
  onUpdated,
}: {
  request: MeasurementRequestView;
  now: number;
  onClose: () => void;
  onUpdated?: (request: MeasurementRequestView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.cancelMeasurementRequest(request.id);
      onUpdated?.(updated);
      announceRequestUpdate(updated);
    } catch (error) {
      setError(apiErrorMessage(error, "ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setBusy(false);
    }
  }
  const state = REQUEST_MARKER_STATES[requestMapStatus(request, now)];
  const place = requestPlaceParts(request.place_name);
  return (
    <section
      className="cp-place-card cp-request-map-card"
      aria-label="รายละเอียดจุดขอค่าฝุ่น"
      style={{ borderTopColor: state.color }}
    >
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        onClick={onClose}
        aria-label="ปิดจุดขอค่าฝุ่น"
      >
        <AppIcon name="close" size={19} />
      </button>
      <div className="cp-place-card__heading">
        <span className="cp-place-card__eyebrow">
          {request.is_owner ? "คำขอของคุณ" : "คำขอให้ช่วยวัด"} ·{" "}
          <span style={{ color: state.color }}>{state.label}</span>
        </span>
        <h2>{place.title}</h2>
        {place.address && <p>{place.address}</p>}
        {place.title === UNKNOWN_REQUEST_PLACE && (
          <p>
            {request.lat.toFixed(5)}, {request.lon.toFixed(5)}
          </p>
        )}
      </div>
      <p>วงรัศมี {request.radius_km} กม. รอบจุดที่ขอ · ไม่ใช่พื้นผิวค่าฝุ่น</p>
      {request.status === "fulfilled" && request.result?.pm25 != null && (
        <p>
          <strong>{request.result.pm25} µg/m³</strong> · ได้รับรายงานแล้ว
        </p>
      )}
      <Link
        href={`/requests/${request.id}`}
        className="cp-measure-link cp-focus"
      >
        ดูรายละเอียดและติดตามคำขอ →
      </Link>
      {request.is_owner &&
        (request.status === "active" || request.status === "scheduled") && (
          <button
            type="button"
            className="cp-request-cancel cp-focus"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {busy ? "กำลังยกเลิก…" : "ยกเลิกคำขอ"}
          </button>
        )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
