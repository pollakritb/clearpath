"use client";

import HistoryChart from "@/frontend/components/panels/HistoryChart";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { HistoryPoint, Station, Weather } from "@/frontend/types";

export interface AQICardProps {
  station: Station | null;
  weather: Weather | null;
  weatherLoading: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  historyPoints: HistoryPoint[];
  historyLoading: boolean;
  onOpenMap: () => void;
}

function WxStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        background: T.chip,
        borderRadius: "9px",
        padding: ".55em .3em",
      }}
    >
      <div style={{ fontSize: ".68em", color: T.subInk }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: "1.05em" }}>
        {value}
      </div>
    </div>
  );
}

export default function AQICard({
  station,
  weather,
  weatherLoading,
  showHistory,
  onToggleHistory,
  historyPoints,
  historyLoading,
  onOpenMap,
}: AQICardProps) {
  // empty state
  if (!station) {
    return (
      <div
        style={{
          border: `1.5px dashed ${T.line}`,
          borderRadius: "13px",
          padding: "1.4em 1em",
          textAlign: "center",
          color: T.subInk,
        }}
      >
        <div
          aria-hidden
          style={{ display: "flex", justifyContent: "center", opacity: 0.5 }}
        >
          <AppIcon name="location" size={28} />
        </div>
        <div
          style={{
            fontSize: ".86em",
            fontWeight: 600,
            marginBottom: ".1em",
            color: T.ink,
          }}
        >
          ยังไม่ได้เลือกสถานี
        </div>
        <div style={{ fontSize: ".78em" }}>
          เลือกสถานีใกล้คุณเพื่อดูค่า PM2.5 และสภาพอากาศแบบละเอียด
        </div>
        <button
          type="button"
          onClick={onOpenMap}
          className="cp-aqi-empty-action cp-focus"
        >
          เลือกสถานีบนแผนที่
        </button>
      </div>
    );
  }

  const cls = classifyPm25(station.pm25);
  const name = station.name_th ?? station.name_en ?? station.id;
  const wind = weather ? `${Math.round(weather.wind_speed)}` : "—";
  const temp = weatherLoading
    ? "…"
    : weather
      ? `${Math.round(weather.temp)}°`
      : "—";
  const humid = weatherLoading
    ? "…"
    : weather
      ? `${Math.round(weather.humidity)}%`
      : "—";

  return (
    <section
      aria-label="คุณภาพอากาศสถานีที่เลือก"
      className="cp-anim-rise"
      style={{
        border: `1px solid ${T.line}`,
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {/* colored header */}
      <div
        style={{ background: cls.color, color: "#fff", padding: ".9em 1em" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "1em" }}>{name}</div>
            {station.province && (
              <div style={{ fontSize: ".78em", opacity: 0.9 }}>
                จ.{station.province}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: ".35em",
              background: "rgba(255,255,255,.22)",
              padding: ".2em .55em",
              borderRadius: "7px",
              fontSize: ".74em",
              fontWeight: 700,
            }}
          >
            <span aria-hidden>{cls.glyph}</span>
            <span>{cls.level}</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: ".4em",
            marginTop: ".5em",
          }}
        >
          <span
            style={{
              fontFamily: T.mono,
              fontWeight: 600,
              fontSize: "3.4em",
              lineHeight: 0.9,
            }}
          >
            {station.pm25 ?? "—"}
          </span>
          <span
            style={{ fontSize: ".85em", opacity: 0.9, paddingBottom: ".5em" }}
          >
            µg/m³ · PM2.5
          </span>
        </div>
      </div>

      {/* body */}
      <div style={{ padding: ".85em 1em", background: T.panel }}>
        <div
          style={{
            display: "flex",
            gap: ".55em",
            alignItems: "flex-start",
            fontSize: ".84em",
            background: T.chip,
            borderRadius: "9px",
            padding: ".55em .65em",
            marginBottom: ".7em",
          }}
        >
          <AppIcon
            aria-hidden
            name="alert"
            size={17}
            style={{ flex: "none" }}
          />
          <span>{cls.advice}</span>
        </div>

        <div className="cp-weather-grid">
          <WxStat label="อุณหภูมิ" value={temp} />
          <WxStat label="ความชื้น" value={humid} />
          <WxStat label="ลม (m/s)" value={wind} />
        </div>

        {weather && (
          <div
            style={{
              color: T.subInk,
              fontSize: ".64em",
              margin: ".35em 0 .65em",
              textAlign: "right",
            }}
          >
            สภาพอากาศจาก{" "}
            <a
              href={
                weather.source === "open_meteo"
                  ? "https://open-meteo.com/"
                  : "https://openweathermap.org/"
              }
              target="_blank"
              rel="noreferrer"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {weather.source === "open_meteo" ? "Open-Meteo" : "OpenWeather"}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleHistory}
          className="cp-focus"
          style={{
            width: "100%",
            minHeight: "44px",
            border: `1px solid ${T.line}`,
            background: T.chip,
            borderRadius: "10px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: ".86em",
            color: T.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: ".45em",
          }}
        >
          <AppIcon aria-hidden name="activity" size={18} />
          <span>{showHistory ? "ซ่อนกราฟ" : "ดูกราฟย้อนหลัง 24 ชม."}</span>
        </button>

        {showHistory && (
          <HistoryChart points={historyPoints} loading={historyLoading} />
        )}
      </div>
    </section>
  );
}
