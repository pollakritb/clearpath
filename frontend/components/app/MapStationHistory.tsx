"use client";

import { useEffect, useMemo, useState } from "react";
import { classifyPm25 } from "@/frontend/lib/aqi";
import {
  formatForecastTime,
  formatForecastTimelineTime,
  formatProviderTime,
} from "@/frontend/lib/forecast-presentation";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { loadPublicData } from "@/frontend/lib/public-data-cache";
import type { HistoryResponse } from "@/frontend/types";

export default function MapStationHistory({
  stationId,
}: {
  stationId: string;
}) {
  const [revision, setRevision] = useState(0);
  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    stationId: string;
    revision: number;
    data?: HistoryResponse;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void loadPublicData(
      `station-history:${stationId}:24`,
      60_000,
      () => api.history(stationId, 24),
      revision > 0,
    )
      .then((data) => {
        if (active) setSnapshot({ stationId, revision, data });
      })
      .catch((error) => {
        if (active)
          setSnapshot({
            stationId,
            revision,
            error: apiErrorMessage(error, "โหลดประวัติไม่สำเร็จ"),
          });
      });
    return () => {
      active = false;
    };
  }, [stationId, revision]);
  const current =
    snapshot?.stationId === stationId && snapshot.revision === revision
      ? snapshot
      : null;
  const points = useMemo(
    () =>
      (current?.data?.points ?? [])
        .filter((point) => Number.isFinite(Date.parse(point.recorded_at)))
        .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)),
    [current],
  );
  const selected =
    points.find((point) => point.recorded_at === selectedAt) ?? points[0];
  const classification = classifyPm25(selected?.pm25);
  return (
    <section
      className="cp-map-station-history"
      aria-label="ค่าตรวจวัดสถานีย้อนหลัง 24 ชั่วโมง"
    >
      <div className="cp-map-station-forecast__heading">
        <span className="cp-map-station-forecast__icon" aria-hidden="true">
          <AppIcon name="clock" size={18} />
        </span>
        <div>
          <h2>ค่าตรวจวัดย้อนหลัง 24 ชั่วโมง</h2>
          <p>Air4Thai · ค่าตรวจวัดจริงของสถานี</p>
        </div>
      </div>
      {current?.error ? (
        <div role="alert">
          <p>{current.error}</p>
          <button
            type="button"
            className="cp-focus"
            onClick={() => setRevision((value) => value + 1)}
          >
            ลองใหม่
          </button>
        </div>
      ) : !current ? (
        <p role="status" className="cp-map-station-forecast__empty">
          กำลังโหลดค่าตรวจวัดย้อนหลัง…
        </p>
      ) : !selected ? (
        <p className="cp-map-station-forecast__empty">
          ยังไม่มีค่าตรวจวัดย้อนหลังใน 24 ชั่วโมงนี้
        </p>
      ) : (
        <>
          <div
            className="cp-map-station-forecast__featured"
            style={
              {
                "--cp-forecast-color": classification.color,
                "--cp-forecast-tint": classification.tint,
              } as React.CSSProperties
            }
          >
            <div>
              <small>ตรวจวัด {formatForecastTime(selected.recorded_at)}</small>
              <strong>
                {selected.pm25 ?? "—"} <span>µg/m³</span>
              </strong>
              <small>
                {selected.pm25 == null
                  ? "ไม่มีข้อมูลช่วงเวลานี้"
                  : `PM2.5 · ${classification.level}`}
              </small>
            </div>
            <span className="cp-map-station-forecast__source">Air4Thai</span>
          </div>
          <div className="cp-map-forecast-range">
            <p>
              {points.length} ช่วงเวลา ·{" "}
              {formatProviderTime(points.at(-1)!.recorded_at)} –{" "}
              {formatProviderTime(points[0].recorded_at)}
            </p>
            <small>
              ล่าสุดอยู่ด้านซ้าย · เลื่อนดูค่าที่เก่ากว่าและแตะเลือกเวลา
            </small>
          </div>
          <div
            className="cp-map-station-forecast__hours"
            role="group"
            aria-label="เลือกเวลาย้อนหลัง"
          >
            {points.map((point) => {
              const slot = formatForecastTimelineTime(point.recorded_at);
              return (
                <button
                  type="button"
                  key={point.recorded_at}
                  className="cp-focus"
                  aria-pressed={point.recorded_at === selected.recorded_at}
                  aria-label={`ย้อนหลัง ${formatProviderTime(point.recorded_at)} PM2.5 ${point.pm25 ?? "ไม่มีข้อมูล"}`}
                  onClick={() => setSelectedAt(point.recorded_at)}
                >
                  <span>{slot.day ?? "วันนี้"}</span>
                  <strong>{slot.time}</strong>
                  <b>{point.pm25 ?? "—"}</b>
                  <small>{point.pm25 == null ? "ไม่มีข้อมูล" : "µg/m³"}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
