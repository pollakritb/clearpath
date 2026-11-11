"use client";
import { useState } from "react";
import PlaceHistoryPanel from "./PlaceHistoryPanel";
import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import MapStationForecast from "./MapStationForecast";
import styles from "./MapPanel.module.css";
import AppIcon from "@/frontend/components/ui/AppIcon";
import {
  readingAgeLabel as age,
  sourceTimeLabel,
} from "@/frontend/lib/reading-time";
import { previousPlaceReading } from "@/frontend/lib/previous-place-reading";
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
  selectionPending?: boolean;
  selectionError?: boolean;
  dataError: string | null;
  onRequestMeasurement: () => void;
}
const distance = (km: number, approximate = false) =>
  `${approximate ? "ประมาณ " : ""}${km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`}`;
export default function PlaceAirCard({
  place,
  air,
  onClose,
  onSelectStation,
  onSelectReport,
  loading,
  selectionPending = false,
  selectionError = false,
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
    reportCount ? `ผู้รายงาน ${reportCount} คน` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const noCurrent = air.value == null;
  const previous =
    noCurrent && !loading && !selectionPending
      ? previousPlaceReading(air)
      : null;
  const single = air.contributors.length === 1 ? air.contributors[0] : null;
  const usedIds = new Set(air.contributors.map((item) => item.id));
  const usedStations = air.stations.filter((item) =>
    usedIds.has(item.station.id),
  );
  const usedReports = air.reports.filter((item) => usedIds.has(item.report.id));
  const unusedStations = air.stations.filter(
    (item) => !usedIds.has(item.station.id),
  );
  const unusedReports = air.reports.filter(
    (item) => !usedIds.has(item.report.id),
  );
  const latestAge = Math.min(
    ...[...usedStations, ...usedReports].flatMap((item) =>
      item.ageMinutes == null ? [] : [item.ageMinutes],
    ),
  );
  const singleAge =
    single?.source === "station"
      ? usedStations[0]?.ageMinutes
      : usedReports[0]?.ageMinutes;
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
              selectionPending ||
              (loading && !air.stations.length && !air.reports.length)
                ? "กำลังโหลดค่าฝุ่น…"
                : noCurrent
                  ? "ยังไม่มีค่าปัจจุบัน"
                  : undefined
            }
          />
          {previous && (
            <p className={styles.address}>
              <strong>
                ข้อมูลล่าสุดจาก {previous.name}: {previous.value!.toFixed(1)}{" "}
                µg/m³
              </strong>
              <br />
              เวลาข้อมูลต้นทาง {sourceTimeLabel(previous.at)} ·{" "}
              {age(previous.ageMinutes)} · {distance(previous.distanceKm)}
              <br />
              <span>ข้อมูลก่อนหน้า ไม่ใช้คำนวณค่าปัจจุบัน</span>
            </p>
          )}
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
                      ? "ยังไม่มีข้อมูลที่ใช้ประเมินได้"
                      : "ยังไม่มีข้อมูลใกล้จุดนี้"}
                  </span>
                  <span>รัศมี {PLACE_RADIUS_KM} กม.</span>
                </>
              ) : (
                <>
                  <span>
                    {sourceSummary
                      ? `${single ? "อ้างอิง" : "ประเมินจาก"} ${sourceSummary}`
                      : "ค่าประเมินพื้นที่"}
                  </span>
                  <span>
                    {single
                      ? `${age(singleAge ?? null)} · ${distance(single.distanceKm, single.source === "report")}`
                      : `${Number.isFinite(latestAge) ? `ล่าสุด ${age(latestAge)} · ` : ""}รัศมี ${PLACE_RADIUS_KM} กม.`}
                  </span>
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
      {selectionError && (
        <p role="alert" className={styles.address}>
          ตรวจข้อมูลผู้รายงานไม่สำเร็จ · ยังไม่รวมรายงานชุมชน
          กรุณาปิดแล้วเปิดสถานที่อีกครั้ง
        </p>
      )}
      {single && (
        <p className={styles.address}>
          ใช้ข้อมูลจุดเดียว ไม่ได้เฉลี่ยกับแหล่งอื่น ·
          ค่าฝุ่นจุดอื่นในวงอาจต่างกัน
        </p>
      )}
      {!!usedStations.length && (
        <section className={styles.section}>
          <h2>
            สถานีที่ใช้คำนวณ <small>{usedStations.length} แห่ง</small>
          </h2>
          <div className={styles.sources}>
            {usedStations.map(({ station, distanceKm, ageMinutes, usable }) => (
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
      {!!usedReports.length && (
        <section className={styles.section}>
          <h2>
            รายงานที่ใช้คำนวณ{" "}
            <small>
              {usedReports.length} คน · {usedReports.length} รายงาน
            </small>
          </h2>
          <div className={styles.sources}>
            {usedReports.map(({ report, distanceKm, ageMinutes, usable }) => (
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
      {(unusedStations.length > 0 || unusedReports.length > 0) && (
        <details className={styles.details}>
          <summary className="cp-focus">
            ข้อมูลอื่นที่ไม่ใช้คำนวณ (
            {unusedStations.length + unusedReports.length})
          </summary>
          <div className={styles.sources}>
            {unusedStations.map(
              ({ station, distanceKm, ageMinutes, usable }) => (
                <button
                  key={station.id}
                  type="button"
                  className={`${styles.source} cp-focus`}
                  data-stale="true"
                  onClick={() => onSelectStation(station)}
                >
                  <AppIcon name="station" size={19} />
                  <span>
                    <strong>
                      {station.name_th ?? station.name_en ?? station.id}
                    </strong>
                    <small>
                      {distance(distanceKm)} · {age(ageMinutes)} ·{" "}
                      {station.pm25 == null
                        ? "ไม่มีค่าฝุ่น"
                        : !usable
                          ? "ไม่ผ่านเกณฑ์ความสด/คุณภาพ"
                          : "ใช้ค่าจุดตรงพิกัดแทน"}
                    </small>
                  </span>
                  <b>{station.pm25?.toFixed(1) ?? "—"}</b>
                </button>
              ),
            )}
            {unusedReports.map(
              ({ report, distanceKm, ageMinutes, usable, exclusion }) => (
                <button
                  key={report.id}
                  type="button"
                  className={`${styles.source} cp-focus`}
                  data-stale="true"
                  onClick={() => onSelectReport(report)}
                >
                  <AppIcon name="user" size={19} />
                  <span>
                    <strong>
                      {report.display_name ?? "ผู้รายงานไม่เปิดเผยตัวตน"}
                    </strong>
                    <small>
                      {distance(distanceKm, true)} · {age(ageMinutes)} ·{" "}
                      {exclusion === "selection_unavailable"
                        ? "ยังตรวจผู้รายงานไม่สำเร็จ"
                        : exclusion === "older"
                          ? "มีรายงานใหม่กว่าจากคนนี้"
                          : !usable
                            ? "เวลาไม่ผ่านเกณฑ์"
                            : "ใช้ค่าจุดตรงพิกัดแทน"}
                    </small>
                  </span>
                  <b>{report.pm25?.toFixed(1) ?? "—"}</b>
                </button>
              ),
            )}
          </div>
        </details>
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
          ค้นหาข้อมูลภายใน {PLACE_RADIUS_KM} กม.
          ไม่ใช่พื้นที่ที่ฝุ่นมีค่าเท่ากัน
        </p>
        <p>
          ใช้สถานีสดไม่เกิน 1 ชั่วโมง
          และรายงานล่าสุดที่ผ่านเกณฑ์ต่อผู้รายงานหนึ่งคนในรัศมีค้นหา
          โดยรายงานต้องอนุมัติและวัดไม่เกิน 3 ชั่วโมง
          หากมีข้อมูลจุดเดียวใช้ค่านั้นโดยตรง
          หากมีหลายจุดถ่วงน้ำหนักตามระยะทางจากพิกัดสาธารณะด้วยสูตร 1/d²
          โดยไม่คูณ Trust หรือ XP
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
