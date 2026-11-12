"use client";
import AppIcon from "@/frontend/components/ui/AppIcon";
import ConfirmAction from "@/frontend/components/ui/ConfirmAction";
import { useState, useRef } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  MeasurementHelperSettings,
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
} from "@/frontend/types";
import { HELPER_LOCATIONS_CHANGED } from "@/frontend/lib/measurement-events";
import HelperLocationEditor from "./HelperLocationEditor";

export default function RegisteredHelperSettings({
  settings,
  onChange,
}: {
  settings: MeasurementHelperSettings;
  onChange: (settings: MeasurementHelperSettings) => void;
}) {
  const [editor, setEditor] = useState<
    MeasurementHelperLocation | null | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const places = settings.locations ?? [];
  const pendingCreated = useRef<MeasurementHelperLocation | null>(null);
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      onChange(await api.measurementHelper());
      window.dispatchEvent(new Event(HELPER_LOCATIONS_CHANGED));
      setMessage("บันทึกการตั้งค่าพื้นที่แล้ว");
      return true;
    } catch (cause) {
      setError(
        apiErrorMessage(cause, "บันทึกพื้นที่ไม่สำเร็จ กรุณาลองอีกครั้ง"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(value: MeasurementHelperLocationWrite, slot?: 1 | 2) {
    const done = await run(async () => {
      const saved = await api.saveMeasurementLocation(
        value,
        slot ?? pendingCreated.current?.slot,
      );
      if (slot == null) pendingCreated.current = saved;
      if (!places.length) await api.setMeasurementHelper(true);
    });
    if (done) {
      pendingCreated.current = null;
      setEditor(undefined);
    }
  }
  return (
    <section
      className="cp-measure-card cp-helper-settings cp-helper-areas"
      aria-label="พื้นที่ที่ฉันช่วยวัดได้"
    >
      <header>
        <div>
          <h3>พื้นที่รับคำขอ</h3>
          <p>เลือกจุดที่คุณพร้อมช่วยวัด เช่น บ้านหรือที่ทำงาน</p>
        </div>
        <span aria-label={`บันทึกแล้ว ${places.length} จาก 2 พื้นที่`}>
          {places.length}/2 จุด
        </span>
      </header>
      <div className="cp-helper-master">
        <label className="cp-helper-switch-label">
          <span>
            <strong>รับคำขอให้ช่วยวัด</strong>
            <small>
              {settings.enabled
                ? "เปิดรับตามพื้นที่ที่เลือกด้านล่าง"
                : "พักรับทุกพื้นที่ โดยยังเก็บจุดเดิมไว้"}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="รับแจ้งคำขอให้ช่วยวัด"
            checked={settings.enabled && places.length > 0}
            disabled={
              busy ||
              !places.length ||
              (!settings.enabled && !places.some((p) => p.enabled))
            }
            onChange={() =>
              void run(() => api.setMeasurementHelper(!settings.enabled))
            }
          />
        </label>
      </div>
      {!places.length && (
        <div className="cp-helper-empty">
          <AppIcon name="location" size={28} />
          <strong>เริ่มจากพื้นที่ที่คุณอยู่บ่อย</strong>
          <p>
            บันทึกได้ 2 จุด พิกัดเห็นเฉพาะคุณ
            <br />
            รับคำขอใกล้พื้นที่นี้เมื่อคุณเปิดรับ
          </p>
        </div>
      )}
      {places.length > 0 && !settings.enabled && (
        <p className="cp-helper-paused" role="status">
          <AppIcon name="pause" size={16} />
          พักรับทุกพื้นที่อยู่ เปิดสวิตช์ด้านบนเมื่อต้องการรับคำขอ
        </p>
      )}
      <div className="cp-helper-places">
        {places.map((place) => (
          <article key={place.slot} className="cp-helper-saved-row">
            <div
              className="cp-helper-place-title"
              data-receiving={settings.enabled && place.enabled}
            >
              <div className="cp-helper-place-copy">
                <strong>{place.name}</strong>
                <small>
                  {place.address ||
                    `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`}
                </small>
              </div>
              <label className="cp-helper-place-receiving">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`รับคำขอที่ ${place.name}`}
                  checked={place.enabled}
                  disabled={busy}
                  onChange={() =>
                    void run(() =>
                      api.saveMeasurementLocation(
                        { ...place, enabled: !place.enabled },
                        place.slot,
                      ),
                    )
                  }
                />
                <span>
                  {!settings.enabled
                    ? "พักทั้งหมด"
                    : place.enabled
                      ? "เปิดรับ"
                      : "พักรับ"}
                </span>
              </label>
            </div>
            <div className="cp-helper-place-actions">
              <button
                type="button"
                className="cp-focus"
                disabled={busy}
                aria-label={`แก้ไขสถานที่ ${place.name}`}
                onClick={() => {
                  setError("");
                  pendingCreated.current = null;
                  setEditor(place);
                }}
              >
                <AppIcon name="settings" size={16} /> แก้ไขพื้นที่
              </button>
              <ConfirmAction
                label={`ลบสถานที่ ${place.name}`}
                description={`ลบพื้นที่รับคำขอ “${place.name}”? คุณสามารถเพิ่มพื้นที่ใหม่ภายหลังได้`}
                disabled={busy}
                onConfirm={() =>
                  void run(() => api.deleteMeasurementLocation(place.slot))
                }
              />
            </div>
          </article>
        ))}
      </div>
      {places.length < 2 && (
        <button
          type="button"
          className="cp-measure-primary cp-focus"
          disabled={busy}
          onClick={() => {
            setError("");
            pendingCreated.current = null;
            setEditor(null);
          }}
        >
          <AppIcon name="location" size={18} /> เพิ่มพื้นที่รับคำขอ
        </button>
      )}
      <p className="cp-helper-private">
        <AppIcon name="shield" size={16} /> พิกัดพื้นที่เห็นเฉพาะคุณ
      </p>
      <details className="cp-helper-details">
        <summary className="cp-focus">การรับคำขอทำงานอย่างไร</summary>
        <small>
          จุดที่บันทึกเป็นข้อมูลส่วนตัว ใช้รับแจ้งคำขอใกล้พื้นที่ที่คุณเลือก
          ไม่จำกัดพื้นที่ส่งรายงาน · ปิดรับชั่วคราวยังเก็บพื้นที่ไว้
          และยังใช้การตั้งค่า LINE กับเวลาพักเดิม
        </small>
      </details>
      <Link
        href="/requests"
        className="cp-measure-link cp-helper-requests-link"
      >
        ดูคำขอให้ช่วยวัด
      </Link>
      {busy && <p role="status">กำลังบันทึก…</p>}
      {message && !busy && (
        <p className="cp-helper-saved-message" role="status">
          {message}
        </p>
      )}
      {error && editor === undefined && <p role="alert">{error}</p>}
      {editor !== undefined && (
        <HelperLocationEditor
          initial={editor}
          first={!places.length}
          busy={busy}
          error={error}
          onSave={save}
          onClose={() => {
            setEditor(undefined);
            if (pendingCreated.current) {
              pendingCreated.current = null;
              void api
                .measurementHelper()
                .then(onChange)
                .catch(() =>
                  setError(
                    "โหลดพื้นที่ล่าสุดไม่สำเร็จ กรุณาลองเปิดหน้านี้อีกครั้ง",
                  ),
                );
            }
          }}
        />
      )}
    </section>
  );
}
