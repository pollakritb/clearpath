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
}: {
  stations: Station[];
  userLocation: { lat: number; lon: number } | null;
  onSelect: (location: LocationSuggestion) => void;
  onMapSelect: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="cp-request-search-screen cp-location-picker-screen"
      aria-label="เลือกพื้นที่ขอค่าฝุ่น"
    >
      <header>
        <button
          type="button"
          className="cp-focus"
          onClick={onClose}
          aria-label="กลับไปแผนที่"
        >
          <AppIcon name="back" size={20} />
        </button>
        <div>
          <h1>ขอค่าฝุ่นที่ไหน?</h1>
          <p>ค้นหาที่อยู่ หรือเลือกจุดบนแผนที่</p>
        </div>
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
