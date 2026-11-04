"use client";

import { useEffect, useRef } from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { useCurrentLocation } from "@/frontend/hooks/useCurrentLocation";
import type { LocationSuggestion } from "@/frontend/types";

export default function LocationPickerActions({
  userLocation,
  onSelect,
  onMapSelect,
}: {
  userLocation?: { lat: number; lon: number } | null;
  onSelect: (place: LocationSuggestion) => void;
  onMapSelect: () => void;
}) {
  // A registered place only reads GPS after the user explicitly chooses this row.
  const gps = useCurrentLocation(false);
  const requested = useRef(false);
  useEffect(() => {
    if (!requested.current || gps.status !== "ready" || !gps.location) return;
    requested.current = false;
    onSelect({
      id: "current-location",
      name: "ตำแหน่งปัจจุบัน",
      address: "",
      kind: "point",
      source: "local",
      lat: gps.location.lat,
      lon: gps.location.lon,
    });
  }, [gps.location, gps.status, onSelect]);
  return (
    <div className="cp-location-picker-actions">
      <button
        type="button"
        className="cp-focus"
        disabled={gps.status === "locating"}
        onClick={() => {
          if (userLocation) {
            onSelect({
              id: "current-location",
              name: "ตำแหน่งปัจจุบัน",
              address: "",
              kind: "point",
              source: "local",
              ...userLocation,
            });
          } else {
            requested.current = true;
            gps.request();
          }
        }}
      >
        <span className="cp-location-picker-actions__icon">
          <AppIcon name="locate" size={21} />
        </span>
        <span>
          {gps.status === "locating" ? "กำลังหาตำแหน่ง…" : "ใช้ตำแหน่งปัจจุบัน"}
          <small>ปรับจุดบนแผนที่ก่อนยืนยัน</small>
        </span>
        <AppIcon name="chevron" size={18} />
      </button>
      <button type="button" className="cp-focus" onClick={onMapSelect}>
        <span className="cp-location-picker-actions__icon">
          <AppIcon name="map" size={21} />
        </span>
        <span>
          เลือกบนแผนที่<small>เลื่อนแผนที่ให้หมุดตรงจุดที่ต้องการ</small>
        </span>
        <AppIcon name="chevron" size={18} />
      </button>
      {(gps.status === "denied" || gps.status === "unavailable") && (
        <p role="alert">
          ยังใช้ตำแหน่งปัจจุบันไม่ได้ คุณสามารถค้นหาที่อยู่หรือเลือกบนแผนที่ได้
        </p>
      )}
    </div>
  );
}
