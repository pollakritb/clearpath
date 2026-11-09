"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  HELPER_LOCATION_EMOJIS,
  helperLocationEmoji,
} from "@/frontend/lib/helper-location-emoji";
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
  const [placeName, setPlaceName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(helperLocationEmoji(initial?.emoji));
  const [name, setName] = useState(initial?.name ?? "");
  const [step, setStep] = useState<Step>(initial ? "details" : "search");
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
    if (lat == null || lon == null || address || step === "search") return;
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
  }, [lat, lon, address, step]);
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
    if (step === "search" || (initial && step === "details")) onClose();
    else setStep(step === "details" ? "map" : "search");
  }
  const select = (place: LocationSuggestion) => {
    setPoint({ lat: place.lat, lon: place.lon, address: place.address });
    setPlaceName(place.name);
    if (!name) setName(place.name.slice(0, 80));
    setMapZoom(15);
    setStep("map");
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
            step === "search" || (initial && step === "details")
              ? "กลับไปตั้งค่าพื้นที่"
              : step === "map"
                ? "กลับไปค้นหาสถานที่"
                : "กลับไปเลือกจุดบนแผนที่"
          }
          onClick={back}
        >
          <AppIcon name="back" size={21} />
        </button>
        <h2>
          {step === "search"
            ? "เลือกพื้นที่รับคำขอ"
            : step === "map"
              ? "ปักหมุดพื้นที่"
              : initial
                ? "แก้ไขสถานที่"
                : "บันทึกพื้นที่รับคำขอ"}
        </h2>
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
              setStep("map");
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
              onMove={(lat, lon) => setPoint({ lat, lon, address: "" })}
            />
          </div>
          <section
            className="cp-helper-editor__sheet"
            aria-label="ยืนยันพื้นที่รับคำขอ"
          >
            <h3>รับคำขอบริเวณนี้</h3>
            <p className="cp-helper-editor__pick-help">
              เลื่อนแผนที่ให้หมุดตรงจุดที่คุณพร้อมช่วยวัด
            </p>
            {location}
            <button
              className="cp-helper-editor__change cp-focus"
              type="button"
              onClick={() => setStep("search")}
            >
              <AppIcon name="search" size={17} /> ค้นหาสถานที่อื่น
            </button>
            <button
              className="cp-measure-primary cp-focus"
              type="button"
              onClick={() => setStep("details")}
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
                  emoji,
                  address: point.address || resolvedLabel?.address || "",
                  enabled: initial?.enabled ?? true,
                },
                initial?.slot,
              );
          }}
        >
          <div className="cp-helper-editor__details-body">
            <p>ชื่อและสัญลักษณ์ที่แสดงบนแผนที่</p>
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
            <fieldset className="cp-helper-emoji-picker">
              <legend>สัญลักษณ์บนแผนที่</legend>
              <div>
                {HELPER_LOCATION_EMOJIS.map((choice) => (
                  <button
                    key={choice.emoji}
                    type="button"
                    className="cp-focus"
                    aria-label={`ใช้สัญลักษณ์${choice.label}`}
                    aria-pressed={emoji === choice.emoji}
                    disabled={busy}
                    onClick={() => setEmoji(choice.emoji)}
                  >
                    <span aria-hidden="true">{choice.emoji}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <section
              className="cp-helper-editor__summary"
              aria-label="จุดที่เลือก"
            >
              {location}
              <button
                className="cp-helper-editor__change cp-focus"
                disabled={busy}
                type="button"
                onClick={() => setStep("map")}
              >
                แก้ไขจุดบนแผนที่
              </button>
            </section>
            <p className="cp-helper-editor__privacy">
              <AppIcon name="shield" size={18} />
              เห็นเฉพาะคุณ · แก้ไขชื่อและสัญลักษณ์ได้ทุกเมื่อ
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
