import Link from "next/link";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { classifyPm25 } from "@/frontend/lib/aqi";
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
}: PlaceAirCardProps) {
  const classification = classifyPm25(air.value);
  const usableCount = air.usedStationCount;

  return (
    <section className="cp-place-card" aria-label="ค่าฝุ่นรอบสถานที่ที่เลือก">
      <div className="cp-map-selection-card__handle" aria-hidden />
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        onClick={onClose}
        aria-label="กลับสู่แผนที่รวม"
      >
        <AppIcon name="close" size={19} />
      </button>
      <div className="cp-place-card__heading">
        <span className="cp-place-card__eyebrow">
          <AppIcon name="location" size={15} /> สถานที่ที่เลือก
        </span>
        <h1>{place.name}</h1>
        <p>{place.address}</p>
      </div>

      <div
        className="cp-place-card__reading"
        aria-live="polite"
        style={
          {
            "--place-color":
              air.value == null ? "#476b69" : classification.color,
            "--place-tint": air.value == null ? "#edf4f2" : classification.tint,
          } as React.CSSProperties
        }
      >
        {loading && air.stations.length === 0 ? (
          <strong>กำลังโหลดข้อมูลค่าฝุ่น…</strong>
        ) : air.value == null ? (
          <>
            <strong>ยังไม่มีค่าฝุ่นที่ประเมินได้</strong>
            <span>
              ไม่มีสถานี Air4Thai ที่ข้อมูลสดภายใน {PLACE_RADIUS_KM} กม.
            </span>
          </>
        ) : (
          <>
            <small>
              {air.method === "nearest_station"
                ? "อ้างอิงสถานีใกล้สุด"
                : `ค่าประมาณจาก ${usableCount} สถานี`}
            </small>
            <strong>
              {air.value.toFixed(1)} <span>µg/m³</span>
            </strong>
            <span>PM2.5 · {classification.level}</span>
          </>
        )}
      </div>

      {dataError && (
        <p className="cp-place-card__error" role="alert">
          อัปเดตข้อมูลสถานีไม่สำเร็จ · โปรดลองอีกครั้ง
        </p>
      )}

      <p className="cp-place-card__radius">
        <AppIcon name="info" size={16} /> วง {PLACE_RADIUS_KM} กม.
        คือระยะค้นหาข้อมูล ไม่ใช่พื้นที่ที่ฝุ่นมีค่าเท่ากัน
      </p>

      <Link
        className="cp-place-card__reset cp-place-card__forecast-link cp-focus"
        href={`/air?lat=${place.lat.toFixed(2)}&lon=${place.lon.toFixed(2)}&place=${encodeURIComponent(place.name)}`}
      >
        ดูพยากรณ์ PM2.5 สำหรับบริเวณนี้
        <AppIcon name="chevron" size={18} />
      </Link>

      <details className="cp-place-card__details">
        <summary className="cp-place-card__details-toggle cp-focus">
          <span>
            <strong>ดูข้อมูลภายในวง {PLACE_RADIUS_KM} กม.</strong>
            <small>
              {air.stations.length} สถานี · {air.reports.length} รายงานจากบุคคล
            </small>
          </span>
          <AppIcon name="chevron" size={19} />
        </summary>
        <div className="cp-place-card__sources">
          <h2>
            สถานีตรวจวัด <small>{air.stations.length} แห่งในวง</small>
          </h2>
          {air.stations.length ? (
            air.stations.map(({ station, distanceKm, ageMinutes, usable }) => (
              <button
                key={station.id}
                type="button"
                className="cp-place-card__source cp-focus"
                onClick={() => onSelectStation(station)}
              >
                <span
                  className="cp-place-card__source-icon"
                  data-kind="official"
                >
                  <AppIcon name="station" size={17} />
                </span>
                <span className="cp-place-card__source-copy">
                  <strong>
                    {station.name_th ?? station.name_en ?? station.id}
                  </strong>
                  <small>
                    {distance(distanceKm)} · {age(ageMinutes)} ·{" "}
                    {usable
                      ? "ใช้ประเมิน"
                      : station.pm25 == null
                        ? "ไม่มีค่าฝุ่น"
                        : "ข้อมูลไม่สด"}
                  </small>
                </span>
                <b>{station.pm25 == null ? "—" : station.pm25.toFixed(1)}</b>
              </button>
            ))
          ) : (
            <p className="cp-place-card__empty">
              ไม่มีสถานีในวงนี้
              {air.nearestStation
                ? ` · ใกล้สุด ${distance(air.nearestStation.distanceKm)}`
                : ""}
            </p>
          )}

          <h2>
            รายงานจากบุคคล <small>{air.reports.length} รายงานในวง</small>
          </h2>
          <p className="cp-place-card__note">
            ข้อมูลประกอบ ไม่ได้นำมาคำนวณค่าหลัก · ระยะจากพิกัดสาธารณะโดยประมาณ
          </p>
          {air.reports.length ? (
            air.reports.map(({ report, distanceKm, ageMinutes }) => (
              <button
                key={report.id}
                type="button"
                className="cp-place-card__source cp-focus"
                onClick={() => onSelectReport(report)}
              >
                <span className="cp-place-card__source-icon" data-kind="report">
                  <AppIcon name="user" size={17} />
                </span>
                <span className="cp-place-card__source-copy">
                  <strong>
                    {report.show_reporter_profile
                      ? (report.display_name ?? "ผู้รายงาน")
                      : "ผู้รายงานไม่เปิดเผยตัวตน"}
                  </strong>
                  <small>
                    {distance(distanceKm, true)} · {age(ageMinutes)} ·
                    ดูภาพและรายละเอียด
                  </small>
                </span>
                <b>{report.pm25?.toFixed(1)}</b>
              </button>
            ))
          ) : (
            <p className="cp-place-card__empty">ไม่มีรายงานที่เผยแพร่ในวงนี้</p>
          )}
        </div>
        <button
          type="button"
          className="cp-place-card__reset cp-focus"
          onClick={onClose}
        >
          กลับสู่แผนที่รวม
        </button>
      </details>
      <small className="cp-place-card__attribution">
        ข้อมูลสถานที่:{" "}
        {place.source === "geoapify" ? (
          <a
            href="https://www.geoapify.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Powered by Geoapify
          </a>
        ) : place.source === "openstreetmap" ? (
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        ) : (
          "ข้อมูลท้องถิ่น ClearPath"
        )}
      </small>
    </section>
  );
}
