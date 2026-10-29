"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { REQUESTS_CHANGED } from "@/frontend/lib/measurement-events";
import type {
  LocationSuggestion,
  MeasurementRequestView,
} from "@/frontend/types";

const RequestAreaMap = dynamic(() => import("./RequestAreaMap"), {
  ssr: false,
});

export default function CreateRequest({
  place,
  initiallyOpen = false,
  mapContext = false,
  selectedRadius,
  onRadiusChange,
}: {
  place: LocationSuggestion;
  initiallyOpen?: boolean;
  mapContext?: boolean;
  selectedRadius?: 1 | 3 | 5;
  onRadiusChange?: (radius: 1 | 3 | 5) => void;
}) {
  const login = useLoginPrompt();
  const [open, setOpen] = useState(initiallyOpen);
  const [localRadius, setRadius] = useState<1 | 3 | 5>(3);
  const radius = selectedRadius ?? localRadius;
  const [scheduled, setScheduled] = useState(false);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MeasurementRequestView | null>(null);
  const key = useRef<string | null>(null);
  async function send() {
    if (login.openLoginPrompt()) return;
    if (
      scheduled &&
      (!time || !Number.isFinite(new Date(`${time}+07:00`).getTime()))
    ) {
      setError("เลือกเวลาที่ต้องการข้อมูล");
      return;
    }
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      setResult(
        await api.createMeasurementRequest({
          place_name: place.name,
          lat: place.lat,
          lon: place.lon,
          radius_km: radius,
          needed_by: scheduled ? new Date(`${time}+07:00`).toISOString() : null,
          idempotency_key: key.current,
        }),
      );
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
    } catch (e) {
      setError(apiErrorMessage(e, "สร้างคำขอไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <div className="cp-measure-create">
        <strong>บันทึกคำขอแล้ว</strong>
        <p>รอรายงานใหม่จากผู้ใช้อื่นในวง {result.radius_km} กม.</p>
        <Link href={`/requests/${result.id}`} className="cp-measure-link">
          ติดตามคำขอนี้
        </Link>
      </div>
    );
  return (
    <div className="cp-measure-create" data-map-context={mapContext}>
      {!mapContext && (
        <button
          type="button"
          className="cp-measure-primary cp-focus"
          onClick={() => {
            if (!login.openLoginPrompt()) setOpen(!open);
          }}
          aria-expanded={open}
        >
          ขอให้ช่วยวัดบริเวณนี้
        </button>
      )}
      {open && (
        <div className="cp-measure-form">
          {!mapContext && (
            <>
              <strong>{place.name}</strong>
              <RequestAreaMap lat={place.lat} lon={place.lon} radius={radius} />
              <p>เลือกบริเวณที่ต้องการค่าฝุ่นใหม่</p>
            </>
          )}
          <fieldset>
            <legend>รัศมีรอบสถานที่</legend>
            <div className="cp-measure-options">
              {([1, 3, 5] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  aria-pressed={radius === r}
                  disabled={busy}
                  onClick={() => {
                    setRadius(r);
                    onRadiusChange?.(r);
                    key.current = null;
                  }}
                >
                  {r} กม.
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>เวลาที่ต้องการข้อมูล</legend>
            <div className="cp-measure-options">
              <button
                type="button"
                aria-pressed={!scheduled}
                disabled={busy}
                onClick={() => {
                  setScheduled(false);
                  key.current = null;
                }}
              >
                ตอนนี้
              </button>
              <button
                type="button"
                aria-pressed={scheduled}
                disabled={busy}
                onClick={() => {
                  setScheduled(true);
                  key.current = null;
                }}
              >
                ก่อนเวลาที่กำหนด
              </button>
            </div>
          </fieldset>
          {scheduled && (
            <label>
              ต้องการข้อมูลก่อน (ภายใน 24 ชม.)
              <input
                type="datetime-local"
                value={time}
                disabled={busy}
                onChange={(e) => {
                  setTime(e.target.value);
                  key.current = null;
                }}
              />
            </label>
          )}
          <p>
            {scheduled
              ? "เริ่มขอช่วยวัด 30 นาทีก่อนเวลาที่เลือก"
              : "เปิดรับรายงานใหม่เป็นเวลา 1 ชั่วโมง"}{" "}
            · ใช้เวลาไทย
          </p>
          <small>
            แจ้งผู้ที่ยินยอมช่วยวัดจากตำแหน่งเข้าเว็บล่าสุดในวง
            ไม่มีการรับประกันว่าจะมีผู้ตอบ ไม่เปิดเผยชื่อหรือแผนการเดินทางของคุณ
          </small>
          <button
            type="button"
            className="cp-measure-primary"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "กำลังบันทึก…" : "ส่งคำขอ"}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
