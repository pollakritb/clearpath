"use client";
import ConfirmAction from "@/frontend/components/ui/ConfirmAction";
import HelpRequestButton from "./HelpRequestButton";
import { useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { announceRequestUpdate } from "@/frontend/lib/measurement-events";
import {
  requestPlaceParts,
  UNKNOWN_REQUEST_PLACE,
} from "@/frontend/lib/request-place";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
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
    <MapBottomSheet
      label="รายละเอียดจุดขอค่าฝุ่น"
      className="cp-request-sheet"
      onClose={onClose}
      closeLabel="ปิดจุดขอค่าฝุ่น"
      header={
        <>
          <div className="cp-place-card__heading">
            <span className="cp-place-card__eyebrow">
              {request.is_owner ? "คำขอของคุณ" : "คำขอให้ช่วยวัด"} ·{" "}
              <span style={{ color: state.color }}>{state.label}</span>
            </span>
            <h2>{place.title}</h2>
            <p>
              ผู้ขอ: {request.requester_name ?? "สมาชิก ClearPath"}
              {request.is_owner ? " (คุณ)" : ""}
            </p>
            {place.address && <p>{place.address}</p>}
            {place.title === UNKNOWN_REQUEST_PLACE && (
              <p>
                {request.lat.toFixed(5)}, {request.lon.toFixed(5)}
              </p>
            )}
          </div>
        </>
      }
    >
      <p>วงรัศมี {request.radius_km} กม. รอบจุดที่ขอ · ไม่ใช่พื้นผิวค่าฝุ่น</p>
      {request.status === "fulfilled" && request.result?.pm25 != null && (
        <p>
          <strong>{request.result.pm25} µg/m³</strong> · ได้รับรายงานแล้ว
        </p>
      )}
      <HelpRequestButton request={request} now={now} />
      <p>
        ช่วงรับรายงาน:{" "}
        {new Date(request.starts_at).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        })}{" "}
        –{" "}
        {new Date(request.expires_at).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        })}
      </p>
      <p>ส่งถึงผู้ช่วยวัด {request.recipient_count} คน</p>
      {request.is_owner &&
        (request.status === "active" || request.status === "scheduled") && (
          <ConfirmAction
            label="ยกเลิกคำขอ"
            description="ยกเลิกคำขอนี้? คำขอจะหยุดรับรายงานและเก็บไว้ในประวัติ"
            className="cp-request-cancel cp-focus"
            disabled={busy}
            onConfirm={() => void cancel()}
          />
        )}
      {error && <p role="alert">{error}</p>}
    </MapBottomSheet>
  );
}
