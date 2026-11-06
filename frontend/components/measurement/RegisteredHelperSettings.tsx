"use client";
import { useState } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type {
  MeasurementHelperSettings,
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
} from "@/frontend/types";
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
  const places = settings.locations ?? [];
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      onChange(await api.measurementHelper());
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
      await api.saveMeasurementLocation(value, slot);
      if (!places.length) await api.setMeasurementHelper(true);
    });
    if (done) setEditor(undefined);
  }
  return (
    <section
      className="cp-measure-card cp-helper-settings"
      aria-label="พื้นที่ที่ฉันช่วยวัดได้"
    >
      <header>
        <div>
          <h3>พื้นที่ที่ฉันช่วยวัดได้</h3>
          <p>รับคำขอใกล้บ้านหรือที่ทำงาน สูงสุด 2 จุด</p>
        </div>
        <span>{places.length}/2 จุด</span>
      </header>
      <label className="cp-measure-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={
            busy || (!settings.enabled && !places.some((p) => p.enabled))
          }
          onChange={() =>
            void run(() => api.setMeasurementHelper(!settings.enabled))
          }
        />
        เปิดรับคำขอในพื้นที่ที่บันทึกไว้
      </label>
      {!places.length && (
        <p>เพิ่มพื้นที่แรกเพื่อเปิดรับคำขอ ไม่ใช้ GPS เมื่อเข้าเว็บล่าสุด</p>
      )}
      <div className="cp-helper-places">
        {places.map((place) => (
          <article key={place.slot}>
            <div className="cp-helper-place-title">
              <AppIcon name="location" size={20} />
              <strong>{place.name}</strong>
              <label>
                <input
                  type="checkbox"
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
                <span>{place.enabled ? "เปิดรับ" : "พักรับ"}</span>
              </label>
            </div>
            <p>
              {place.address ||
                `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`}
            </p>
            <div className="cp-helper-place-actions">
              <button
                type="button"
                className="cp-focus"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setEditor(place);
                }}
              >
                แก้ไขพื้นที่
              </button>
              <button
                type="button"
                className="cp-focus"
                disabled={busy}
                onClick={() =>
                  void run(() => api.deleteMeasurementLocation(place.slot))
                }
              >
                ลบพื้นที่
              </button>
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
            setEditor(null);
          }}
        >
          เพิ่มพื้นที่รับคำขอ
        </button>
      )}
      <details className="cp-helper-details">
        <summary className="cp-focus">
          รายละเอียดการรับคำขอและความเป็นส่วนตัว
        </summary>
        <small>
          จุดที่บันทึกเป็นข้อมูลส่วนตัว ใช้รับแจ้งคำขอเท่านั้น
          ไม่จำกัดพื้นที่ส่งรายงาน · ปิดรับชั่วคราวยังเก็บพื้นที่ไว้
          และยังใช้การตั้งค่า LINE กับเวลาพักเดิม
        </small>
      </details>
      <Link href="/requests" className="cp-measure-link">
        ดูคำขอให้ช่วยวัด
      </Link>
      {error && editor === undefined && <p role="alert">{error}</p>}
      {editor !== undefined && (
        <HelperLocationEditor
          initial={editor}
          first={!places.length}
          busy={busy}
          error={error}
          onSave={save}
          onClose={() => setEditor(undefined)}
        />
      )}
    </section>
  );
}
