"use client";

import { useEffect, useState } from "react";

import Legend from "@/frontend/components/panels/Legend";
import { api } from "@/frontend/lib/api-client";
import type { LocationSuggestion } from "@/frontend/types";

import type { ViewMode } from "./dashboard-types";

interface MapChromeProps {
  viewMode: ViewMode;
  stationCount: number;
  bigText: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBigText: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
}

export default function MapChrome({
  viewMode,
  stationCount,
  bigText,
  onViewModeChange,
  onToggleBigText,
  onLocationSelect,
}: MapChromeProps) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      void api
        .searchLocations(query.trim())
        .then((result) => setLocations(result.locations))
        .catch(() => setLocations([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <>
      <div className="cp-viewtoggle">
        {(["map", "list"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            aria-pressed={viewMode === mode}
            className="cp-focus"
            data-active={viewMode === mode}
          >
            {mode === "map" ? "แผนที่" : "รายการ"}
          </button>
        ))}
      </div>

      <div className="cp-location-search">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length < 2) setLocations([]);
          }}
          placeholder="ค้นหาตำบลหรืออำเภอในนครปฐม"
          aria-label="ค้นหาตำบลหรืออำเภอ"
          className="cp-location-search__input cp-focus"
        />
        {locations.length > 0 && (
          <div className="cp-location-search__results">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                className="cp-location-search__option cp-focus"
                onClick={() => {
                  onLocationSelect(location);
                  setQuery(`${location.name}, ${location.district}`);
                  setLocations([]);
                }}
              >
                <strong>{location.name}</strong>
                <small>
                  อ.{location.district} ·{" "}
                  {location.kind === "subdistrict" ? "ตำบล" : "อำเภอ"}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cp-legend-wrap">
        <Legend />
      </div>

      <div className="cp-brandpill">
        <div aria-hidden className="cp-brandpill__mark">
          C
        </div>
        <div className="cp-brandpill__name">ClearPath Community</div>
        <span className="cp-brandpill__count">{stationCount} สถานี</span>
        <button
          type="button"
          onClick={onToggleBigText}
          aria-label="สลับขนาดตัวอักษร"
          className="cp-brandpill__text-button cp-focus"
          data-active={bigText}
        >
          ก
        </button>
      </div>
    </>
  );
}
