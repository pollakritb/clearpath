"use client";

import Link from "next/link";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
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
  onCreated,
  resolvingName = false,
}: {
  point: LocationSuggestion | null;
  editing: boolean;
  onConfirm: () => void;
  onReselect: () => void;
  onSearch?: () => void;
  onClose: () => void;
  onCreated?: (request: MeasurementRequestView) => void;
  resolvingName?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editing) return;
    const panel =
      panelRef.current?.querySelector<HTMLElement>("[data-map-sheet]");
    const map = panel?.closest<HTMLElement>(".cp-map");
    if (!panel || !map) return;
    const measure = () =>
      map.style.setProperty(
        "--cp-request-sheet-h",
        `${Math.ceil(panel.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(panel);
    return () => {
      observer?.disconnect();
      map.style.removeProperty("--cp-request-sheet-h");
    };
  }, [editing]);
  return (
    <div
      ref={panelRef}
      className="cp-map-request-flow"
      data-editing={editing}
      style={{ display: "contents" }}
    >
      <MapBottomSheet
        key={editing ? "form" : "pick"}
        label="ขอค่าฝุ่นบนแผนที่"
        className="cp-request-picker-sheet"
        initialSnap={editing ? "half" : "peek"}
        onClose={onClose}
        closeLabel="ปิดการขอค่าฝุ่น"
        header={
          <>
            <h2>{editing ? "ขอค่าฝุ่นบริเวณนี้" : "เลือกจุดขอค่าฝุ่น"}</h2>
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
            {!editing && point && (
              <p className="cp-request-pick-hint">เลื่อนแผนที่เพื่อปรับจุด</p>
            )}
            {!editing && (
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
          </>
        }
      >
        {editing && point && (
          <div
            className="cp-map-request-panel"
            style={{ position: "static", maxHeight: "none", padding: 0 }}
          >
            <CreateRequest
              key={`${point.lat}:${point.lon}`}
              place={point}
              initiallyOpen
              mapContext
              onCreated={onCreated}
              resolvingName={resolvingName}
            />
          </div>
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
      </MapBottomSheet>
    </div>
  );
}
