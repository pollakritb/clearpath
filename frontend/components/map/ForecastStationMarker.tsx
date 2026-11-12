"use client";

import L from "leaflet";
import { Marker, useMap } from "react-leaflet";
import { useEffect } from "react";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { formatForecastTime } from "@/frontend/lib/forecast-grid";
import type { ForecastStationPoint } from "@/frontend/types/ui";

/** A forecast at a station's location, never an observed station reading. */
export default function ForecastStationMarker({
  point,
}: {
  point: ForecastStationPoint;
}) {
  const map = useMap();
  const { lat, lon } = point;
  useEffect(() => {
    const container = map.getContainer();
    const sheet = container
      .closest(".cp-map")
      ?.querySelector<HTMLElement>(".cp-timeline-sheet");
    if (!sheet) return;
    let manuallyMoved = false;
    const release = () => {
      manuallyMoved = true;
    };
    const reveal = () => {
      if (manuallyMoved) return;
      const bounds = container.getBoundingClientRect();
      const top = Math.min(140, bounds.height * 0.28);
      const bottom = sheet.getBoundingClientRect().top - bounds.top - 8;
      if (bottom - top < 66) return;
      const position = map.latLngToContainerPoint([lat, lon]);
      if (
        position.y - 33 < top ||
        position.y + 33 > bottom ||
        position.x < 40 ||
        position.x > bounds.width - 40
      ) {
        map.panBy(
          [position.x - bounds.width / 2, position.y - (top + bottom) / 2],
          { animate: false },
        );
      }
    };
    // Wait out any existing station flyTo as well as sheet height changes.
    // Once the user moves the map, preserve their chosen viewport.
    map.on("moveend", reveal);
    container.addEventListener("pointerdown", release);
    container.addEventListener("wheel", release, { passive: true });
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(sheet);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off("moveend", reveal);
      container.removeEventListener("pointerdown", release);
      container.removeEventListener("wheel", release);
    };
  }, [map, lat, lon]);
  const valid =
    !point.loading &&
    !point.error &&
    point.pm25 != null &&
    Number.isFinite(point.pm25) &&
    point.pm25 >= 0;
  const value = valid ? point.pm25!.toFixed(1) : "—";
  const color = classifyPm25(valid ? point.pm25 : null).color;
  const status = point.loading
    ? "กำลังโหลดพยากรณ์"
    : point.error || !valid
      ? "ไม่มีข้อมูลพยากรณ์"
      : `พยากรณ์ PM2.5 ${value} ไมโครกรัมต่อลูกบาศก์เมตร`;
  const title = `${point.name} · ${status} · ${formatForecastTime(point.validAt)} · CAMS ไม่ใช่ค่าตรวจวัดจริง`;
  return (
    <Marker
      position={[point.lat, point.lon]}
      interactive={false}
      keyboard={false}
      zIndexOffset={1500}
      title={title}
      alt={title}
      icon={L.divIcon({
        className: "cp-marker cp-marker--forecast-station",
        iconSize: [72, 66],
        iconAnchor: [36, 33],
        html: `<div class="cp-forecast-station-marker" style="--marker-aqi:${color}" role="img" aria-label="${status}"><div><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/></svg><b>${value}</b></div><span>พยากรณ์</span></div>`,
      })}
    />
  );
}
