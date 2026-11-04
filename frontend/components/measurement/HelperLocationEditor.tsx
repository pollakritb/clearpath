"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";
import MapSearchPanel from "@/frontend/components/app/MapSearchPanel";
import type {
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
  LocationSuggestion,
} from "@/frontend/types";

const LocationMap = dynamic(() => import("./HelperLocationMap"), {
  ssr: false,
});
export default function HelperLocationEditor({
  initial,
  onSave,
  onClose,
  busy,
  error,
  first,
}: {
  initial: MeasurementHelperLocation | null;
  onSave: (value: MeasurementHelperLocationWrite, slot?: 1 | 2) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  first: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [point, setPoint] = useState<{
    lat: number;
    lon: number;
    address: string;
  } | null>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [search, setSearch] = useState(!initial);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const select = (place: LocationSuggestion) => {
    setPoint({ lat: place.lat, lon: place.lon, address: place.address });
    if (!name) setName(place.name.slice(0, 80));
    setSearch(false);
  };
  return (
    <dialog
      ref={dialog}
      className="cp-helper-editor"
      aria-label={initial ? "แก้ไขพื้นที่รับคำขอ" : "เพิ่มพื้นที่รับคำขอ"}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{initial ? "แก้ไขพื้นที่รับคำขอ" : "เพิ่มพื้นที่รับคำขอ"}</h2>
        <button
          type="button"
          className="cp-focus"
          disabled={busy}
          aria-label="ปิดการเลือกพื้นที่"
          onClick={onClose}
        >
          <AppIcon name="close" size={20} />
        </button>
      </header>
      {search ? (
        <MapSearchPanel
          embedded
          purpose="helper"
          stations={[]}
          onClose={() => {}}
          onLocationSelect={select}
          onStationSelect={() => {}}
        />
      ) : (
        point && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !busy)
                onSave(
                  {
                    ...point,
                    name: name.trim(),
                    enabled: initial?.enabled ?? true,
                  },
                  initial?.slot,
                );
            }}
          >
            <p>เลื่อนแผนที่ให้หมุดตรงพื้นที่ที่คุณพร้อมช่วยวัด</p>
            <LocationMap
              point={point}
              onMove={(lat, lon) => setPoint({ lat, lon, address: "" })}
            />
            <small>
              {point.address ||
                `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`}
            </small>
            <button
              className="cp-helper-text-button cp-focus"
              type="button"
              onClick={() => setSearch(true)}
            >
              ค้นหาสถานที่อื่น
            </button>
            <label>
              ชื่อพื้นที่
              <input
                autoComplete="off"
                aria-label="ชื่อพื้นที่รับคำขอ"
                required
                maxLength={80}
                placeholder="เช่น บ้าน หรือที่ทำงาน"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              className="cp-measure-primary cp-focus"
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy
                ? "กำลังบันทึก…"
                : first
                  ? "บันทึกและเปิดรับคำขอ"
                  : "บันทึกพื้นที่"}
            </button>
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
