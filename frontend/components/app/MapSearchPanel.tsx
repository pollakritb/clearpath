"use client";

import { useEffect, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import type { LocationSuggestion, Station } from "@/frontend/types";

interface MapSearchPanelProps {
  stations: Station[];
  onClose: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

const SEARCH_DELAY_MS = 250;
const MINIMUM_QUERY_LENGTH = 2;

export default function MapSearchPanel({
  stations,
  onClose,
  onLocationSelect,
  onStationSelect,
}: MapSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("th");
  const canSearch = normalizedQuery.length >= MINIMUM_QUERY_LENGTH;
  const visibleLocations = canSearch ? locations : [];
  const stationMatches = canSearch
    ? stations
        .filter((station) =>
          `${station.id} ${station.name_th ?? ""} ${station.name_en ?? ""} ${station.province ?? ""}`
            .toLocaleLowerCase("th")
            .includes(normalizedQuery),
        )
        .slice(0, 6)
    : [];

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!canSearch) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api
        .searchLocations(query.trim())
        .then((result) => {
          if (!cancelled) setLocations(result.locations);
        })
        .catch(() => {
          if (!cancelled) setLocations([]);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearch, query]);

  function selectStation(station: Station) {
    onStationSelect(station);
    onClose();
  }

  function selectLocation(location: LocationSuggestion) {
    onLocationSelect(location);
    onClose();
  }

  return (
    <section
      id="cp-map-search-panel"
      className="cp-map-flyout cp-map-search-panel"
      aria-label="ค้นหาสถานีหรือพื้นที่"
    >
      <div className="cp-map-flyout__heading">
        <div>
          <strong>ค้นหาบนแผนที่</strong>
          <small>สถานี จังหวัด อำเภอ หรือตำบล</small>
        </div>
        <button
          type="button"
          className="cp-map-flyout__close cp-focus"
          onClick={onClose}
          aria-label="ปิดการค้นหา"
        >
          <AppIcon name="close" size={20} />
        </button>
      </div>

      <label className="cp-map-search-field">
        <AppIcon name="search" size={19} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาสถานีหรือพื้นที่"
          aria-label="คำค้นหา"
        />
      </label>

      {query.trim().length > 0 && !canSearch && (
        <p className="cp-map-search-panel__hint">พิมพ์อย่างน้อย 2 ตัวอักษร</p>
      )}
      {(stationMatches.length > 0 || visibleLocations.length > 0) && (
        <div className="cp-map-search-results">
          {stationMatches.map((station) => (
            <button
              key={`station:${station.id}`}
              type="button"
              className="cp-map-search-option cp-focus"
              onClick={() => selectStation(station)}
            >
              <span className="cp-map-search-option__icon" data-kind="station">
                <AppIcon name="station" size={18} />
              </span>
              <span>
                <strong>
                  {station.name_th ?? station.name_en ?? station.id}
                </strong>
                <small>
                  สถานีตรวจวัด Air4Thai
                  {station.province ? ` · ${station.province}` : ""}
                </small>
              </span>
            </button>
          ))}
          {visibleLocations.map((location) => (
            <button
              key={location.id}
              type="button"
              className="cp-map-search-option cp-focus"
              onClick={() => selectLocation(location)}
            >
              <span className="cp-map-search-option__icon" data-kind="location">
                <AppIcon name="location" size={18} />
              </span>
              <span>
                <strong>{location.name}</strong>
                <small>
                  อ.{location.district} ·{" "}
                  {location.kind === "subdistrict" ? "ตำบล" : "อำเภอ"}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
