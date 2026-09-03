"use client";

import { useEffect, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api } from "@/frontend/lib/api-client";
import type { LocationSuggestion, Station } from "@/frontend/types";

import type { ViewMode } from "./dashboard-types";

interface MapChromeProps {
  viewMode: ViewMode;
  stationCount: number;
  sensorCount: number;
  individualReportCount: number;
  fireCount: number;
  fireAvailable: boolean;
  demoMode: boolean;
  stations: Station[];
  bigText: boolean;
  showHeatmap: boolean;
  showStations: boolean;
  showCommunitySensors: boolean;
  showIndividualReports: boolean;
  showFires: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBigText: () => void;
  onToggleHeatmap: () => void;
  onToggleStations: () => void;
  onToggleCommunitySensors: () => void;
  onToggleIndividualReports: () => void;
  onToggleFires: () => void;
  onLocationSelect: (location: LocationSuggestion) => void;
  onStationSelect: (station: Station) => void;
}

type OpenPanel = "search" | "layers" | null;

export default function MapChrome({
  viewMode,
  stationCount,
  sensorCount,
  individualReportCount,
  fireCount,
  fireAvailable,
  demoMode,
  stations,
  bigText,
  showHeatmap,
  showStations,
  showCommunitySensors,
  showIndividualReports,
  showFires,
  onViewModeChange,
  onToggleBigText,
  onToggleHeatmap,
  onToggleStations,
  onToggleCommunitySensors,
  onToggleIndividualReports,
  onToggleFires,
  onLocationSelect,
  onStationSelect,
}: MapChromeProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
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
  const visibleLocations = query.trim().length < 2 ? [] : locations;

  useEffect(() => {
    if (openPanel === "search") searchRef.current?.focus();
  }, [openPanel]);

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

  const closePanel = () => setOpenPanel(null);

  return (
    <>
      <div className="cp-map-topbar" aria-label="ข้อมูลแผนที่ ClearPath">
        <div aria-hidden className="cp-map-topbar__mark">
          C
        </div>
        <div className="cp-map-topbar__copy">
          <strong>ClearPath</strong>
          <small>คุณภาพอากาศทั่วไทย</small>
        </div>
        <span className="cp-map-topbar__count">
          {stationCount + sensorCount + individualReportCount}{" "}
          <small>จุดข้อมูล</small>
        </span>
        {demoMode && <span className="cp-map-demo-badge">ข้อมูลจำลอง</span>}
      </div>

      <div className="cp-map-actions" aria-label="เครื่องมือแผนที่">
        <button
          type="button"
          className="cp-map-action cp-focus"
          aria-label="ค้นหาสถานีหรือพื้นที่"
          aria-expanded={openPanel === "search"}
          aria-controls="cp-map-search-panel"
          data-active={openPanel === "search"}
          onClick={() =>
            setOpenPanel((current) => (current === "search" ? null : "search"))
          }
        >
          <AppIcon name="search" size={22} />
        </button>
        <button
          type="button"
          className="cp-map-action cp-focus"
          aria-label="เลือกข้อมูลที่แสดงบนแผนที่"
          aria-expanded={openPanel === "layers"}
          aria-controls="cp-map-layers-panel"
          data-active={openPanel === "layers"}
          onClick={() =>
            setOpenPanel((current) => (current === "layers" ? null : "layers"))
          }
        >
          <AppIcon name="layers" size={22} />
        </button>
      </div>

      <div
        className="cp-map-source-legend"
        aria-label="คำอธิบายประเภทจุดข้อมูล"
      >
        <span data-source="official">
          <i>
            <AppIcon name="station" size={15} />
          </i>
          สถานีรัฐ
        </span>
        <span data-source="sensor">
          <i>
            <AppIcon name="community-station" size={15} />
          </i>
          สถานีชุมชน
        </span>
        <span data-source="individual">
          <i>
            <AppIcon name="user" size={15} />
          </i>
          บุคคลรายงาน
        </span>
      </div>

      {openPanel === "search" && (
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
              onClick={closePanel}
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
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="cp-map-search-panel__hint">
              พิมพ์อย่างน้อย 2 ตัวอักษร
            </p>
          )}
          {(stationMatches.length > 0 || visibleLocations.length > 0) && (
            <div className="cp-map-search-results">
              {stationMatches.map((station) => (
                <button
                  key={`station:${station.id}`}
                  type="button"
                  className="cp-map-search-option cp-focus"
                  onClick={() => {
                    onStationSelect(station);
                    setQuery(station.name_th ?? station.name_en ?? station.id);
                    closePanel();
                  }}
                >
                  <span
                    className="cp-map-search-option__icon"
                    data-kind="station"
                  >
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
                  onClick={() => {
                    onLocationSelect(location);
                    setQuery(`${location.name}, ${location.district}`);
                    closePanel();
                  }}
                >
                  <span
                    className="cp-map-search-option__icon"
                    data-kind="location"
                  >
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
      )}

      {openPanel === "layers" && (
        <section
          id="cp-map-layers-panel"
          className="cp-map-flyout cp-map-layers-panel"
          aria-label="เลือกข้อมูลที่แสดงบนแผนที่"
        >
          <div className="cp-map-flyout__heading">
            <div>
              <strong>ข้อมูลบนแผนที่</strong>
              <small>สัญลักษณ์แต่ละแบบมาจากคนละแหล่ง</small>
            </div>
            <button
              type="button"
              className="cp-map-flyout__close cp-focus"
              onClick={closePanel}
              aria-label="ปิดตัวเลือกข้อมูล"
            >
              <AppIcon name="close" size={20} />
            </button>
          </div>

          <div className="cp-map-layer-list">
            <button
              type="button"
              className="cp-map-layer cp-focus"
              data-active={showStations}
              aria-pressed={showStations}
              onClick={onToggleStations}
            >
              <span className="cp-layer-symbol cp-layer-symbol--station">
                <AppIcon name="station" size={18} />
              </span>
              <span>
                <strong>สถานีตรวจวัดทางการ</strong>
                <small>Air4Thai · {stationCount} สถานี</small>
              </span>
              <span className="cp-layer-switch" aria-hidden />
            </button>
            <button
              type="button"
              className="cp-map-layer cp-focus"
              data-active={showFires}
              aria-pressed={showFires}
              onClick={onToggleFires}
            >
              <span className="cp-layer-symbol cp-layer-symbol--fire">
                <AppIcon name="fire" size={18} />
              </span>
              <span>
                <strong>จุดต้องสงสัยการเผาไหม้</strong>
                <small>
                  NASA FIRMS ·{" "}
                  {fireAvailable ? `${fireCount} จุด` : "ยังไม่มีข้อมูล"}
                </small>
              </span>
              <span className="cp-layer-switch" aria-hidden />
            </button>
            <button
              type="button"
              className="cp-map-layer cp-focus"
              data-active={showCommunitySensors}
              aria-pressed={showCommunitySensors}
              onClick={onToggleCommunitySensors}
            >
              <span className="cp-layer-symbol cp-layer-symbol--sensor">
                <AppIcon name="community-station" size={17} />
              </span>
              <span>
                <strong>สถานีเซนเซอร์ชุมชน</strong>
                <small>อุปกรณ์ประจำจุดที่ลงทะเบียน · {sensorCount} สถานี</small>
              </span>
              <span className="cp-layer-switch" aria-hidden />
            </button>
            <button
              type="button"
              className="cp-map-layer cp-focus"
              data-active={showIndividualReports}
              aria-pressed={showIndividualReports}
              onClick={onToggleIndividualReports}
            >
              <span className="cp-layer-symbol cp-layer-symbol--individual">
                <AppIcon name="user" size={15} />
              </span>
              <span>
                <strong>รายงานจากบุคคล</strong>
                <small>
                  ภาพเครื่องวัดพร้อม GPS · {individualReportCount} รายงาน
                </small>
              </span>
              <span className="cp-layer-switch" aria-hidden />
            </button>
            <button
              type="button"
              className="cp-map-layer cp-focus"
              data-active={showHeatmap}
              aria-pressed={showHeatmap}
              onClick={onToggleHeatmap}
            >
              <span className="cp-layer-symbol cp-layer-symbol--surface" />
              <span>
                <strong>พื้นผิวค่าฝุ่น</strong>
                <small>คำนวณจากข้อมูลที่ผ่านเกณฑ์</small>
              </span>
              <span className="cp-layer-switch" aria-hidden />
            </button>
          </div>

          <div className="cp-map-layer-actions">
            <button
              type="button"
              className="cp-focus"
              onClick={() => {
                onViewModeChange(viewMode === "map" ? "list" : "map");
                closePanel();
              }}
            >
              <AppIcon name={viewMode === "map" ? "menu" : "map"} size={19} />
              {viewMode === "map" ? "ดูรายการสถานี" : "กลับไปแผนที่"}
            </button>
            <button
              type="button"
              className="cp-focus"
              data-active={bigText}
              aria-pressed={bigText}
              onClick={onToggleBigText}
            >
              <span aria-hidden>ก</span>
              ตัวอักษรใหญ่
            </button>
          </div>
          <p className="cp-map-layer-note">
            สีหลักและรูปทรงบอกเจ้าของข้อมูล · จุดเล็กบอกระดับ PM2.5
          </p>
        </section>
      )}
    </>
  );
}
