"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import styles from "@/frontend/styles/mobile-refinements.module.css";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import { PLACE_RADIUS_KM } from "@/frontend/lib/place-air";
import type { LocationSuggestion, Station } from "@/frontend/types";

interface MapSearchPanelProps {
  embedded?: boolean;
  locationPicker?: boolean;
  purpose?: "request" | "helper";
  forecastMode?: boolean;
  stations: Station[];
  onClose: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

const MINIMUM_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 450;

export default function MapSearchPanel({
  embedded = false,
  locationPicker = false,
  purpose = "request",
  forecastMode = false,
  stations,
  onClose,
  onLocationSelect,
  onStationSelect,
}: MapSearchPanelProps) {
  const searchId = useId();
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
    if (!embedded) searchRef.current?.focus();
  }, [embedded]);

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
      id={embedded ? undefined : "cp-map-search-panel"}
      className={
        embedded
          ? `cp-measure-card cp-measure-search${locationPicker ? " cp-location-search" : ""}`
          : "cp-map-flyout cp-map-search-panel"
      }
      aria-label={
        embedded
          ? purpose === "helper"
            ? "ค้นหาพื้นที่รับคำขอ"
            : "เลือกสถานที่เพื่อขอค่าฝุ่น"
          : "ค้นหาสถานที่หรือสถานี"
      }
    >
      {!locationPicker && (
        <div className="cp-map-flyout__heading">
          <div>
            <strong>
              {embedded
                ? purpose === "helper"
                  ? "ค้นหาพื้นที่ที่ช่วยวัดได้"
                  : "ขอค่าฝุ่นจากชุมชน"
                : "ค้นหาสถานที่"}
            </strong>
            <small>
              {embedded
                ? purpose === "helper"
                  ? "ค้นหาบ้านหรือที่ทำงาน แล้วปรับจุดให้ตรงบนแผนที่"
                  : "ค้นหาชื่อสถานที่หรือที่อยู่ แล้วเลือกผลลัพธ์เพื่อปรับจุดบนแผนที่"
                : forecastMode
                  ? "ดูพยากรณ์ CAMS ของบริเวณที่เลือก"
                  : `ดูค่าฝุ่นและแหล่งข้อมูลในระยะ ${PLACE_RADIUS_KM} กม.`}
            </small>
          </div>
          {!embedded && (
            <button
              type="button"
              className="cp-map-flyout__close cp-focus"
              onClick={onClose}
              aria-label="ปิดการค้นหา"
            >
              <AppIcon name="close" size={20} />
            </button>
          )}
        </div>
      )}

      <label className={styles.searchLabel} htmlFor={searchId}>
        {locationPicker ? "สถานที่หรือที่อยู่" : "ค้นหาสถานที่หรือสถานี"}
      </label>
      <form className="cp-map-search-form" onSubmit={submitSearch}>
        <div className={`cp-map-search-field ${styles.searchField}`}>
          <AppIcon name="search" size={19} />
          <input
            ref={searchRef}
            id={searchId}
            name="place-search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={
              locationPicker
                ? "ค้นหาสถานที่หรือที่อยู่"
                : "ชื่อสถานที่ ที่อยู่ หรือสถานี"
            }
            autoComplete="off"
            type="search"
          />
          {query && (
            <button
              type="button"
              className={`cp-focus ${styles.clearSearch}`}
              aria-label="ล้างคำค้นหา"
              onClick={() => {
                updateQuery("");
                searchRef.current?.focus();
              }}
            >
              <AppIcon name="close" size={18} />
            </button>
          )}
        </div>
        {!locationPicker && (
          <button
            type="submit"
            className="cp-map-search-submit cp-focus"
            disabled={!canSearch || loading}
          >
            ค้นหา
          </button>
        )}
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
          {locationPicker
            ? "ค้นหาไม่สำเร็จ ลองใหม่หรือเลือกบนแผนที่ด้านล่าง"
            : "ค้นหาสถานที่ไม่สำเร็จ กรุณาลองอีกครั้งหรือกดค้นหา"}
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
