"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import LocationPickerActions from "./LocationPickerActions";
import { api } from "@/frontend/lib/api-client";
import { THAILAND_CENTER } from "@/frontend/lib/constants";
import AppIcon from "@/frontend/components/ui/AppIcon";
import MapSearchPanel from "@/frontend/components/app/MapSearchPanel";
import type {
  MeasurementHelperLocation,
  MeasurementHelperLocationWrite,
  LocationSuggestion,
} from "@/frontend/types";

const LocationMap = dynamic(() => import("./HelperLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="cp-helper-editor__map-loading" role="status">
      กำลังเปิดแผนที่…
    </div>
  ),
});
type Step = "search" | "map" | "details";

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
  const [pointChosen, setPointChosen] = useState(Boolean(initial));
  const [placeName, setPlaceName] = useState(initial?.name ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [steps, setSteps] = useState<Step[]>([initial ? "details" : "search"]);
  const step = steps.at(-1)!;
  const previousStep = steps.at(-2);
  const go = (next: Step) =>
    setSteps((previous) =>
      previous.at(-1) === next ? previous : [...previous, next],
    );
  const [mapZoom, setMapZoom] = useState(15);
  const [resolved, setResolved] = useState<{
    lat: number;
    lon: number;
    name: string;
    address: string;
  } | null>(null);
  const lat = point?.lat,
    lon = point?.lon,
    address = point?.address;
  useEffect(() => {
    if (
      !pointChosen ||
      lat == null ||
      lon == null ||
      address ||
      step === "search"
    )
      return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api
        .reverseLocation(lat, lon)
        .then((label) => {
          if (!cancelled) setResolved({ lat, lon, ...label });
        })
        .catch(() => {
          /* Coordinates remain usable when address lookup is unavailable. */
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lat, lon, address, step, pointChosen]);
  const resolvedLabel =
    resolved?.lat === lat && resolved?.lon === lon ? resolved : null;
  useEffect(() => {
    const element = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  function back() {
    if (busy) return;
    if (steps.length === 1) onClose();
    else setSteps((previous) => previous.slice(0, -1));
  }
  const select = (place: LocationSuggestion) => {
    setPointChosen(true);
    setPoint({ lat: place.lat, lon: place.lon, address: place.address });
    setPlaceName(place.name);
    if (!name) setName(place.name.slice(0, 80));
    setMapZoom(15);
    go("map");
  };
  const location = point && (
    <div className="cp-helper-editor__location">
      <span className="cp-helper-editor__location-icon">
        <AppIcon name="location" size={22} />
      </span>
      <div>
        <strong>
          {point.address
            ? placeName
            : resolvedLabel?.name || "จุดที่เลือกบนแผนที่"}
        </strong>
        <small>
          {point.address ||
            resolvedLabel?.address ||
            `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`}
        </small>
      </div>
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className="cp-helper-editor"
      data-step={step}
      aria-label={initial ? "แก้ไขพื้นที่รับคำขอ" : "เพิ่มพื้นที่รับคำขอ"}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="cp-helper-editor__header">
        <button
          type="button"
          className="cp-focus"
          disabled={busy}
          aria-label={
            previousStep === "map"
              ? "กลับไปเลือกจุดบนแผนที่"
              : previousStep === "search"
                ? "กลับไปค้นหาสถานที่"
                : previousStep === "details"
                  ? "กลับไปแก้ไขพื้นที่"
                  : "กลับไปตั้งค่าพื้นที่"
          }
          onClick={back}
        >
          <AppIcon name="back" size={21} />
        </button>
        {step === "map" && point ? (
          <button
            type="button"
            className="cp-helper-editor__map-search cp-focus"
            aria-label="ค้นหาหรือแก้ไขพื้นที่รับคำขอ"
            onClick={() => go("search")}
          >
            <AppIcon name="location" size={18} />
            <span>
              <small>พื้นที่รับคำขอ</small>
              <strong>
                {point.address
                  ? placeName
                  : pointChosen
                    ? resolvedLabel?.name || "จุดที่เลือกบนแผนที่"
                    : "ค้นหาหรือเลือกพื้นที่"}
              </strong>
            </span>
            <AppIcon name="search" size={18} />
          </button>
        ) : (
          <h2>
            {step === "search"
              ? "เลือกพื้นที่รับคำขอ"
              : initial
                ? "แก้ไขสถานที่"
                : "บันทึกพื้นที่รับคำขอ"}
          </h2>
        )}
        <button
          type="button"
          className="cp-focus"
          disabled={busy}
          aria-label="ปิดการเลือกพื้นที่"
          onClick={onClose}
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>
      {step === "search" ? (
        <div className="cp-helper-editor__search">
          <MapSearchPanel
            embedded
            locationPicker
            purpose="helper"
            stations={[]}
            onClose={() => {}}
            onLocationSelect={select}
            onStationSelect={() => {}}
          />
          <LocationPickerActions
            onSelect={select}
            onMapSelect={() => {
              if (!point) {
                setPoint({
                  lat: THAILAND_CENTER[0],
                  lon: THAILAND_CENTER[1],
                  address: "",
                });
                setPlaceName("จุดที่เลือกบนแผนที่");
                setMapZoom(6);
              }
              go("map");
            }}
          />
          <p className="cp-helper-editor__privacy">
            <AppIcon name="shield" size={18} />
            บันทึกได้ 2 จุด เช่น บ้านและที่ทำงาน พิกัดเห็นเฉพาะคุณ
          </p>
        </div>
      ) : step === "map" && point ? (
        <>
          <div className="cp-helper-editor__map">
            <LocationMap
              point={point}
              initialZoom={mapZoom}
              onZoomChange={setMapZoom}
              onMove={(lat, lon) => {
                setPointChosen(true);
                setPoint({ lat, lon, address: "" });
              }}
            />
          </div>
          <section
            className="cp-helper-editor__sheet"
            aria-label="ยืนยันพื้นที่รับคำขอ"
          >
            <h3>รับคำขอบริเวณนี้</h3>
            <p className="cp-helper-editor__pick-help">
              เลื่อนแผนที่ให้หมุดตรงจุดที่ต้องการ หรือใช้ตำแหน่งของฉัน
            </p>
            <p className="cp-helper-editor__pick-address">
              {pointChosen
                ? point.address ||
                  resolvedLabel?.address ||
                  `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`
                : "ยังไม่ได้เลือกจุด"}
            </p>
            <button
              className="cp-measure-primary cp-focus"
              type="button"
              onClick={() => go("details")}
              disabled={!pointChosen}
            >
              ยืนยันจุดนี้
            </button>
          </section>
        </>
      ) : point ? (
        <form
          className="cp-helper-editor__details"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !busy)
              onSave(
                {
                  ...point,
                  name: name.trim(),
                  emoji: initial?.emoji ?? "📍",
                  address: point.address || resolvedLabel?.address || "",
                  enabled: initial?.enabled ?? true,
                },
                initial?.slot,
              );
          }}
        >
          <div className="cp-helper-editor__details-body">
            <p>ตั้งชื่อให้จำง่าย เช่น บ้านหรือที่ทำงาน</p>
            <label className="cp-helper-editor__name">
              ชื่อพื้นที่
              <input
                autoComplete="off"
                aria-label="ชื่อพื้นที่รับคำขอ"
                required
                maxLength={80}
                placeholder="เช่น บ้าน หรือที่ทำงาน"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {!initial && (
              <div
                className="cp-helper-editor__presets"
                aria-label="ชื่อพื้นที่ที่ใช้บ่อย"
              >
                {["บ้าน", "ที่ทำงาน"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="cp-focus"
                    disabled={busy}
                    aria-pressed={name === label}
                    onClick={() => setName(label)}
                  >
                    <AppIcon
                      name={label === "บ้าน" ? "home" : "station"}
                      size={18}
                    />
                    {label}
                  </button>
                ))}
              </div>
            )}
            <section
              className="cp-helper-editor__summary"
              aria-label="จุดที่เลือก"
            >
              {location}
              <button
                className="cp-helper-editor__change cp-focus"
                disabled={busy}
                type="button"
                onClick={() => go("map")}
              >
                แก้ไขจุดบนแผนที่
              </button>
            </section>
            <p className="cp-helper-editor__privacy">
              <AppIcon name="shield" size={18} />
              เห็นเฉพาะคุณ · แก้ไขชื่อและพื้นที่ได้ทุกเมื่อ
            </p>
            {error && (
              <p className="cp-helper-editor__error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="cp-helper-editor__footer">
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
          </footer>
        </form>
      ) : null}
    </dialog>
  );
}
