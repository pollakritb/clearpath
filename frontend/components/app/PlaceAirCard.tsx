"use client";
import { useState } from "react";
import PlaceHistoryPanel from "./PlaceHistoryPanel";
import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import MapStationForecast from "./MapStationForecast";
import styles from "./MapPanel.module.css";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { PLACE_RADIUS_KM, type PlaceAir } from "@/frontend/lib/place-air";
import type {
  CommunityReport,
  LocationSuggestion,
  Station,
} from "@/frontend/types";
interface PlaceAirCardProps {
  place: LocationSuggestion;
  air: PlaceAir;
  onClose: () => void;
  onSelectStation: (station: Station) => void;
  onSelectReport: (report: CommunityReport) => void;
  loading: boolean;
  dataError: string | null;
  onRequestMeasurement: () => void;
}
const distance = (km: number, approximate = false) =>
  `${approximate ? "ประมาณ " : ""}${km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`}`;
const age = (minutes: number | null) =>
  minutes == null
    ? "ไม่ทราบเวลาวัด"
    : minutes < 60
      ? `${Math.round(minutes)} นาทีที่แล้ว`
      : `${Math.round(minutes / 60)} ชม.ที่แล้ว`;
export default function PlaceAirCard({
  place,
  air,
  onClose,
  onSelectStation,
  onSelectReport,
  loading,
  dataError,
  onRequestMeasurement,
}: PlaceAirCardProps) {
  const [timeMode, setTimeMode] = useState<"history" | "forecast" | null>(null);
  if (timeMode === "history")
    return (
      <PlaceHistoryPanel
        place={place}
        current={air}
        onBack={() => setTimeMode(null)}
        onClose={onClose}
      />
    );
  if (timeMode === "forecast")
    return (
      <MapBottomSheet
        key="place-forecast"
        label="พยากรณ์ค่าฝุ่นของสถานที่"
        className={styles.panel}
        initialSnap="full"
        onClose={onClose}
        header={
          <>
            <button
              type="button"
              className={`${styles.action} cp-focus`}
              onClick={() => setTimeMode(null)}
            >
              <AppIcon name="back" size={17} /> กลับไปที่สถานที่
            </button>
            <h1 className={styles.title}>{place.name}</h1>
          </>
        }
      >
        <MapStationForecast area={{ lat: place.lat, lon: place.lon }} />
      </MapBottomSheet>
    );
  const stationCount = air.contributors.filter(
    (point) => point.source === "station",
  ).length;
  const reportCount = air.contributors.filter(
    (point) => point.source === "report",
  ).length;
  const sourceSummary = [
    stationCount ? `${stationCount} สถานี` : "",
    reportCount ? `${reportCount} รายงาน` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const noCurrent = air.value == null;
  return (
    <MapBottomSheet
      key="place-current"
      label={`ค่าฝุ่นรอบ ${place.name}`}
      className={`cp-place-sheet ${styles.panel} ${styles.placePanel}`}
      initialSnap="peek"
      onClose={onClose}
      closeLabel="ปิดสถานที่ที่เลือก"
      header={
        <>
          <h1 className={styles.title}>{place.name}</h1>
          <MapPanelReading
            value={air.value == null ? null : Number(air.value.toFixed(1))}
            status={
              loading && !air.stations.length && !air.reports.length
                ? "กำลังโหลดค่าฝุ่น…"
                : noCurrent
                  ? "ยังไม่มีค่าปัจจุบัน"
                  : undefined
            }
          />
          <div className={styles.placeFooter}>
            <p
              className={styles.placeMeta}
              aria-label={`ข้อมูลในรัศมี ${PLACE_RADIUS_KM} กม.`}
              title={
                noCurrent
                  ? "ไม่มีข้อมูลสดพอใช้ประเมิน"
                  : "ค่าประเมินจากแหล่งข้อมูลใกล้เคียง ไม่ใช่การวัดที่จุดนี้โดยตรง"
              }
            >
              {noCurrent ? (
                <>
                  <span>
                    {air.stations.length || air.reports.length
                      ? "ข้อมูลใกล้เคียงไม่สด"
                      : "ยังไม่มีข้อมูลใกล้จุดนี้"}
                  </span>
                  <span>รัศมี {PLACE_RADIUS_KM} กม.</span>
                </>
              ) : (
                <>
                  <span>
                    {sourceSummary
                      ? `ประเมินจาก ${sourceSummary}`
                      : "ค่าประเมินพื้นที่"}
                  </span>
                  <span>รัศมี {PLACE_RADIUS_KM} กม.</span>
                </>
              )}
            </p>
            <div className={`${styles.actions} ${styles.placeActions}`}>
              <button
                type="button"
                className={`${styles.action} cp-focus`}
                aria-label="ดูย้อนหลังของสถานที่นี้"
                onClick={() => setTimeMode("history")}
              >
                <AppIcon name="clock" size={17} /> ย้อนหลัง
              </button>
              <button
                type="button"
                className={`${styles.action} cp-focus`}
                aria-label="ดูพยากรณ์ของสถานที่นี้"
                onClick={() => setTimeMode("forecast")}
              >
                <AppIcon name="wind" size={17} /> พยากรณ์
              </button>
            </div>
          </div>
        </>
      }
    >
      {dataError && (
        <p role="alert" className={styles.address}>
          อัปเดตข้อมูลไม่สำเร็จ · แสดงข้อมูลล่าสุดที่โหลดได้
        </p>
      )}
      {!!air.stations.length && (
        <section className={styles.section}>
          <h2>
            สถานีใกล้เคียง <small>{air.stations.length} แห่ง</small>
          </h2>
          <div className={styles.sources}>
            {air.stations.map(({ station, distanceKm, ageMinutes, usable }) => (
              <button
                key={station.id}
                type="button"
                className={`${styles.source} cp-focus`}
                data-stale={!usable}
                onClick={() => onSelectStation(station)}
              >
                <AppIcon name="station" size={19} />
                <span>
                  <strong>
                    {station.name_th ?? station.name_en ?? station.id}
                  </strong>
                  <small>
                    {distance(distanceKm)} · {age(ageMinutes)}
                    {station.pm25 == null
                      ? " · ไม่มีค่าฝุ่น"
                      : !usable
                        ? " · ข้อมูลไม่สด"
                        : ""}
                  </small>
                </span>
                <b>{station.pm25 == null ? "—" : station.pm25.toFixed(1)}</b>
              </button>
            ))}
          </div>
        </section>
      )}
      {!!air.reports.length && (
        <section className={styles.section}>
          <h2>
            รายงานจากชุมชน <small>{air.reports.length} รายงาน</small>
          </h2>
          <div className={styles.sources}>
            {air.reports.map(({ report, distanceKm, ageMinutes, usable }) => (
              <button
                key={report.id}
                type="button"
                className={`${styles.source} cp-focus`}
                data-stale={!usable}
                onClick={() => onSelectReport(report)}
              >
                <AppIcon name="user" size={19} />
                <span>
                  <strong>
                    {report.display_name ?? "ผู้รายงานไม่เปิดเผยตัวตน"}
                  </strong>
                  <small>
                    {distance(distanceKm, true)} · {age(ageMinutes)}
                    {!usable ? " · ข้อมูลไม่สด" : ""}
                  </small>
                </span>
                <b>{report.pm25?.toFixed(1) ?? "—"}</b>
              </button>
            ))}
          </div>
        </section>
      )}
      {
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} cp-focus`}
            onClick={onRequestMeasurement}
          >
            <AppIcon name="community" size={17} /> ขอให้ช่วยวัดบริเวณนี้
          </button>
        </div>
      }
      <p className={styles.address}>{place.address}</p>
      <details className={styles.details}>
        <summary className="cp-focus">ที่มาและวิธีประเมิน</summary>
        <p>
          วง {PLACE_RADIUS_KM} กม. คือระยะค้นหาข้อมูล
          ไม่ใช่พื้นที่ที่ฝุ่นมีค่าเท่ากัน
        </p>
        <p>
          ใช้สถานีสดไม่เกิน 1 ชั่วโมง และรายงานที่อนุมัติและวัดไม่เกิน 3 ชั่วโมง
          ถ่วงน้ำหนักตามระยะทางจากพิกัดสาธารณะ
        </p>
        <p>
          ข้อมูลสถานที่:{" "}
          {place.source === "geoapify" ? (
            <a
              href="https://www.geoapify.com/"
              target="_blank"
              rel="noreferrer"
            >
              Powered by Geoapify
            </a>
          ) : place.source === "openstreetmap" || place.source === "photon" ? (
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          ) : (
            "ข้อมูลท้องถิ่น ClearPath"
          )}
        </p>
      </details>
    </MapBottomSheet>
  );
}
