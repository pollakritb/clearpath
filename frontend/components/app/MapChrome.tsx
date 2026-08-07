"use client";

import { useEffect, useState } from "react";

import Legend from "@/frontend/components/panels/Legend";
import { api } from "@/frontend/lib/api-client";
import type { LocationSuggestion, Station } from "@/frontend/types";

import type { ViewMode } from "./dashboard-types";

interface MapChromeProps {
  viewMode: ViewMode;
  stationCount: number;
  stations: Station[];
  bigText: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBigText: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

export default function MapChrome({
  viewMode,
  stationCount,
  stations,
  bigText,
  onViewModeChange,
  onToggleBigText,
  onLocationSelect,
  onStationSelect,
}: MapChromeProps) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const stationMatches =
    query.trim().length < 2
      ? []
      : stations
          .filter((station) =>
            `${station.id} ${station.name_th ?? ""} ${station.name_en ?? ""} ${station.province ?? ""}`
              .toLocaleLowerCase("th")
              .includes(query.trim().toLocaleLowerCase("th")),
          )
          .slice(0, 6);

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
          placeholder="ค้นหาสถานีหรือจังหวัดทั่วประเทศ"
          aria-label="ค้นหาสถานีหรือพื้นที่"
          className="cp-location-search__input cp-focus"
        />
        {(stationMatches.length > 0 || locations.length > 0) && (
          <div className="cp-location-search__results">
            {stationMatches.map((station) => (
              <button
                key={`station:${station.id}`}
                type="button"
                className="cp-location-search__option cp-focus"
                onClick={() => {
                  onStationSelect(station);
                  setQuery(station.name_th ?? station.name_en ?? station.id);
                  setLocations([]);
                }}
              >
                <strong>
                  {station.name_th ?? station.name_en ?? station.id}
                </strong>
                <small>
                  สถานี Air4Thai
                  {station.province ? ` · ${station.province}` : ""}
                </small>
              </button>
            ))}
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
        <div className="cp-brandpill__name">
          <strong>ClearPath</strong>
          <small>อากาศทั่วประเทศไทย</small>
        </div>
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
