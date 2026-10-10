"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import type { LocationSuggestion, Station } from "@/frontend/types";

interface MapSearchPanelProps {
  stations: Station[];
  onClose: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

const MINIMUM_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 450;

export default function MapSearchPanel({
  stations,
  onClose,
  onLocationSelect,
  onStationSelect,
}: MapSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const [coverage, setCoverage] = useState<"nationwide" | "limited" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const runSearch = useCallback(async (submitted: string) => {
    const sequence = ++searchSequence.current;
    setSearchedQuery(submitted);
    setSearchFailed(false);
    setLoading(true);
    try {
      const result = await api.searchLocations(submitted);
      if (sequence !== searchSequence.current) return;
      setLocations(result.locations);
      setCoverage(result.coverage);
    } catch {
      if (sequence !== searchSequence.current) return;
      setLocations([]);
      setCoverage(null);
      setSearchFailed(true);
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < MINIMUM_QUERY_LENGTH) return;
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      void runSearch(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = null;
      searchSequence.current += 1;
    };
  }, [query, runSearch]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSearch) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    void runSearch(query.trim());
  }

  function selectStation(station: Station) {
    onStationSelect(station);
    onClose();
  }

  function selectLocation(location: LocationSuggestion) {
    onLocationSelect(location);
    onClose();
  }

  function updateQuery(value: string) {
    searchSequence.current += 1;
    setQuery(value);
    setSearchedQuery("");
    setLocations([]);
    setCoverage(null);
    setLoading(false);
    setSearchFailed(false);
  }

  return (
    <section
      id="cp-map-search-panel"
      className="cp-map-flyout cp-map-search-panel"
      aria-label="ค้นหาสถานที่หรือสถานี"
    >
      <div className="cp-map-flyout__heading">
        <div>
          <strong>ค้นหาสถานที่</strong>
          <small>ดูค่าฝุ่นและแหล่งข้อมูลในระยะ 5 กม.</small>
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

      <form className="cp-map-search-form" onSubmit={submitSearch}>
        <label className="cp-map-search-field">
          <AppIcon name="search" size={19} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="ชื่อสถานที่ ที่อยู่ หรือสถานี"
            aria-label="คำค้นหา"
            autoComplete="off"
            type="search"
          />
        </label>
        <button
          type="submit"
          className="cp-map-search-submit cp-focus"
          disabled={!canSearch || loading}
        >
          ค้นหา
        </button>
      </form>
      {!searchedQuery && canSearch && !stationMatches.length && (
        <p className="cp-map-search-panel__hint">
          พิมพ์ชื่อสถานที่บางส่วน แล้วเลือกจากคำแนะนำ
        </p>
      )}

      {query.trim().length > 0 && !canSearch && (
        <p className="cp-map-search-panel__hint">พิมพ์อย่างน้อย 3 ตัวอักษร</p>
      )}
      {loading && (
        <p className="cp-map-search-panel__hint" role="status">
          กำลังค้นหาสถานที่…
        </p>
      )}
      {searchedQuery === query.trim() && !loading && coverage === "limited" && (
        <p className="cp-map-search-panel__hint" role="status">
          ค้นหาสถานที่ได้จำกัดเฉพาะข้อมูลท้องถิ่นในขณะนี้
        </p>
      )}
      {searchedQuery === query.trim() &&
        !loading &&
        coverage &&
        !locations.length &&
        !stationMatches.length && (
          <p className="cp-map-search-panel__hint">
            ไม่พบสถานที่หรือสถานีที่ตรงคำค้น
          </p>
        )}
      {searchFailed && (
        <p className="cp-map-search-panel__hint" role="alert">
          ค้นหาสถานที่ไม่สำเร็จ กรุณาลองอีกครั้งหรือกดค้นหา
        </p>
      )}
      {(stationMatches.length > 0 || visibleLocations.length > 0) && (
        <div className="cp-map-search-results">
          {visibleLocations.length > 0 && (
            <p className="cp-map-search-group">สถานที่</p>
          )}
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
                <small>{location.address}</small>
              </span>
            </button>
          ))}
          {stationMatches.length > 0 && (
            <p className="cp-map-search-group">สถานีตรวจวัด</p>
          )}
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
                  Air4Thai{station.province ? ` · ${station.province}` : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {coverage === "nationwide" && (
        <a
          className="cp-map-search-attribution"
          href={
            visibleLocations.some((location) => location.source === "photon")
              ? "https://www.openstreetmap.org/copyright"
              : "https://www.geoapify.com/"
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          {visibleLocations.some((location) => location.source === "photon")
            ? "© OpenStreetMap contributors"
            : "Powered by Geoapify"}
        </a>
      )}
    </section>
  );
}
