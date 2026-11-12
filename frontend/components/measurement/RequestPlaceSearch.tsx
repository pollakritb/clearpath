"use client";

import MapSearchPanel from "@/frontend/components/app/MapSearchPanel";
import LocationPickerActions from "./LocationPickerActions";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type { LocationSuggestion, Station } from "@/frontend/types";

export default function RequestPlaceSearch({
  stations,
  userLocation,
  onSelect,
  onMapSelect,
  onClose,
  onExit,
  backLabel = "กลับไปแผนที่",
}: {
  stations: Station[];
  userLocation: { lat: number; lon: number } | null;
  onSelect: (location: LocationSuggestion) => void;
  onMapSelect: () => void;
  onClose: () => void;
  onExit?: () => void;
  backLabel?: string;
}) {
  return (
    <section
      className="cp-request-search-screen cp-location-picker-screen"
      aria-label="เลือกพื้นที่ขอค่าฝุ่น"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <button
          type="button"
          className="cp-focus"
          onClick={onClose}
          aria-label={backLabel}
        >
          <AppIcon name="back" size={20} />
        </button>
        <div>
          <h1>ขอค่าฝุ่นที่ไหน?</h1>
          <p>ค้นหาที่อยู่ หรือเลือกจุดบนแผนที่</p>
        </div>
        {onExit && (
          <button
            type="button"
            className="cp-request-search-exit cp-focus"
            aria-label="ปิดการขอค่าฝุ่น"
            onClick={onExit}
          >
            <AppIcon name="close" size={20} />
          </button>
        )}
      </header>
      <MapSearchPanel
        embedded
        locationPicker
        stations={stations}
        onClose={onMapSelect}
        onLocationSelect={onSelect}
        onStationSelect={(station) =>
          onSelect({
            id: `station:${station.id}`,
            name: station.name_th ?? station.name_en ?? station.id,
            address: station.province ?? "",
            kind: "station",
            source: "local",
            lat: station.lat,
            lon: station.lon,
          })
        }
      />
      <LocationPickerActions
        userLocation={userLocation}
        onSelect={onSelect}
        onMapSelect={onMapSelect}
      />
    </section>
  );
}
