"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type {
  LocationSuggestion,
  MeasurementRequestView,
} from "@/frontend/types";
import CreateRequest from "./CreateRequest";
import { requestPlaceTitle } from "@/frontend/lib/request-place";

export default function MapRequestPanel({
  point,
  editing,
  onConfirm,
  onReselect,
  onSearch,
  onClose,
  radius = 3,
  onRadiusChange,
  onCreated,
  resolvingName = false,
}: {
  point: LocationSuggestion | null;
  editing: boolean;
  onConfirm: () => void;
  onReselect: () => void;
  onSearch?: () => void;
  onClose: () => void;
  radius?: 1 | 3 | 5;
  onRadiusChange?: (radius: 1 | 3 | 5) => void;
  onCreated?: (request: MeasurementRequestView) => void;
  resolvingName?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (editing) return;
    const panel = panelRef.current;
    const map = panel?.closest<HTMLElement>(".cp-map");
    if (!panel || !map) return;
    const measure = () =>
      map.style.setProperty(
        "--cp-request-sheet-h",
        `${Math.ceil(panel.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      map.style.removeProperty("--cp-request-sheet-h");
    };
  }, [editing]);
  return (
    <section
      ref={panelRef}
      data-editing={editing}
      className="cp-place-card cp-map-request-panel"
      aria-label="ขอค่าฝุ่นบนแผนที่"
    >
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        aria-label="ปิดการขอค่าฝุ่น"
        onClick={onClose}
      >
        <AppIcon name="close" size={19} />
      </button>
      <div className="cp-place-card__heading">
        <h2>{editing ? "ขอค่าฝุ่นบริเวณนี้" : "ปรับจุดขอค่าฝุ่น"}</h2>
        {!editing && (
          <p className="cp-request-pick-hint">
            เลื่อนแผนที่ให้หมุดตรงจุดที่ต้องการ
          </p>
        )}
      </div>
      <div className="cp-map-request-location">
        {point ? (
          <p className="cp-map-request-point">
            <strong>
              {resolvingName
                ? "กำลังระบุพื้นที่…"
                : requestPlaceTitle(point.name)}
            </strong>
            <span>
              {point.address ? (
                point.address
              ) : (
                <>
                  {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                </>
              )}
            </span>
          </p>
        ) : (
          <p>
            เลื่อนแผนที่ให้หมุดตรงกลางชี้จุดที่ต้องการ
            หรือค้นหาสถานที่ด้วยปุ่มแว่นขยาย
          </p>
        )}
        {editing && point && (
          <button
            className="cp-map-request-reselect cp-focus"
            type="button"
            aria-label="เปลี่ยนจุดบนแผนที่"
            onClick={onReselect}
          >
            เปลี่ยนจุด
          </button>
        )}
      </div>
      {editing && point ? (
        <>
          <CreateRequest
            key={`${point.lat}:${point.lon}`}
            place={point}
            initiallyOpen
            mapContext
            selectedRadius={radius}
            onRadiusChange={onRadiusChange}
            onCreated={onCreated}
            resolvingName={resolvingName}
          />
        </>
      ) : (
        <>
          <button
            className="cp-measure-primary cp-focus"
            type="button"
            disabled={!point}
            onClick={onConfirm}
            aria-label="ใช้จุดนี้เพื่อขอค่าฝุ่น"
          >
            ยืนยันจุดนี้
          </button>
        </>
      )}
      {!editing && (
        <div className="cp-request-secondary-actions">
          {onSearch && (
            <button type="button" className="cp-focus" onClick={onSearch}>
              <AppIcon name="search" size={16} /> ค้นหาที่อื่น
            </button>
          )}
          <Link href="/requests" className="cp-focus">
            <AppIcon name="community" size={16} /> คำขอของฉัน
          </Link>
        </div>
      )}
    </section>
  );
}
