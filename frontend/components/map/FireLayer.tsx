"use client";
import { useMemo, useState } from "react";
import { useMapEvents } from "react-leaflet";
import L from "leaflet";
import HotspotObservationTime from "./HotspotObservationTime";
import PriorityMarker, { useMarkerPriority } from "./PriorityMarker";
import MapSheetPortal from "./MapSheetPortal";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
import { SATELLITE_GLYPH } from "@/frontend/components/ui/satellite-glyph";
import { clusterMapPoints } from "@/frontend/lib/station-clusters";
import { flyMapToBounds } from "@/frontend/lib/map-motion";
import {
  hotspotConfidence,
  hotspotSatellite,
} from "@/frontend/lib/hotspot-display";
import type { FirePoint } from "@/frontend/types";
import styles from "./HotspotLayer.module.css";

// A satellite, not a flame: detections are not confirmed fire incidents.
function hotspotIcon(count: number, selected: boolean) {
  const group = count > 1;
  return L.divIcon({
    className: `cp-marker ${styles.marker}`,
    html: `<span class="${styles.symbol}" data-group="${group}" data-selected="${selected}"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${SATELLITE_GLYPH}" transform="rotate(-30 12 12)" /></svg>${group ? `<b>${count}</b>` : ""}</span>`,
    iconSize: [group ? 48 : 44, 44],
    iconAnchor: [group ? 24 : 22, 22],
  });
}

export default function FireLayer({
  fires,
  onSelect,
}: {
  fires: FirePoint[];
  onSelect?: () => void;
}) {
  const priority = useMarkerPriority();
  const [viewVersion, setViewVersion] = useState(0);
  const map = useMapEvents({
    moveend: () => setViewVersion((v) => v + 1),
    zoomend: () => setViewVersion((v) => v + 1),
  });
  const selected = fires.find((f) => priority?.active === `hotspot:${f.id}`);
  const groups = useMemo(() => {
    const bounds = map.getBounds().pad(0.25);
    return clusterMapPoints(
      fires.filter(
        (f) => f.id !== selected?.id && bounds.contains([f.lat, f.lon]),
      ),
      map.getZoom(),
      { maxZoom: Infinity, radius: 64 },
    );
    // viewVersion represents mutations of the Leaflet viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fires, map, selected?.id, viewVersion]);
  const selectedGroup = groups.find(
    (g) => priority?.active === `hotspot-group:${g.id}`,
  );
  const markers = selected
    ? [
        ...groups,
        {
          id: selected.id,
          lat: selected.lat,
          lon: selected.lon,
          stations: [selected],
        },
      ]
    : groups;
  return (
    <>
      {markers.map((group) => {
        const single = group.stations.length === 1 ? group.stations[0] : null;
        const id = single
          ? `hotspot:${single.id}`
          : `hotspot-group:${group.id}`;
        const label = single
          ? `จุดความร้อนจากดาวเทียม · ${hotspotSatellite(single.satellite)} · แตะดูเวลาตรวจพบและรายละเอียด`
          : `กลุ่มจุดความร้อนจากดาวเทียม ${group.stations.length} จุด · จำนวนจุดตรวจพบ ไม่ใช่จำนวนเหตุไฟไหม้ · แตะเพื่อขยายหรือดูรายการ`;
        return (
          <PriorityMarker
            key={group.id}
            priorityId={id}
            position={[group.lat, group.lon]}
            icon={hotspotIcon(group.stations.length, priority?.active === id)}
            title={label}
            alt={label}
            eventHandlers={{
              click: () => {
                onSelect?.();
                if (!single && map.getZoom() < map.getMaxZoom()) {
                  priority?.clear();
                  flyMapToBounds(
                    map,
                    group.stations.map((f) => [f.lat, f.lon]),
                    {
                      padding: [48, 48],
                      maxZoom: Math.min(map.getZoom() + 3, map.getMaxZoom()),
                    },
                  );
                }
              },
            }}
          />
        );
      })}
      {selected && (
        <MapSheetPortal key={selected.id}>
          <MapBottomSheet
            adaptive
            className={`cp-hotspot-sheet ${styles.sheet}`}
            label="จุดความร้อนจากดาวเทียม"
            onClose={() => priority?.clear()}
            header={
              <>
                <h2>จุดความร้อนจากดาวเทียม</h2>
                {selected.acquired_at ? (
                  <HotspotObservationTime value={selected.acquired_at} />
                ) : (
                  <p>ไม่ระบุเวลาตรวจพบที่แน่นอน</p>
                )}
              </>
            }
          >
            <div className={styles.details}>
              <p>NASA FIRMS · {hotspotSatellite(selected.satellite)}</p>
              <dl>
                <dt>ความเชื่อมั่นการตรวจจับ</dt>
                <dd>{hotspotConfidence(selected.confidence)}</dd>
                <dt>กำลังการแผ่รังสีความร้อน</dt>
                <dd>
                  {selected.frp == null ? "ไม่ระบุ" : `${selected.frp} MW`}
                </dd>
                {selected.daynight && (
                  <>
                    <dt>ช่วงที่ตรวจพบ</dt>
                    <dd>
                      {selected.daynight.toUpperCase() === "D"
                        ? "กลางวัน"
                        : selected.daynight.toUpperCase() === "N"
                          ? "กลางคืน"
                          : "ไม่ระบุ"}
                    </dd>
                  </>
                )}
              </dl>
              <small>
                FRP คือกำลังการแผ่รังสีความร้อน ไม่ใช่ค่า PM2.5
                หรือขนาดพื้นที่ไหม้
              </small>
              {selected.source_products.length > 1 && (
                <p>
                  รวมจุดซ้ำจาก {selected.source_products.length}{" "}
                  ชุดข้อมูลดาวเทียม
                </p>
              )}
              <p className="cp-hotspot-note">
                ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว · จุดความร้อนอาจมีได้หลายสาเหตุ
              </p>
            </div>
          </MapBottomSheet>
        </MapSheetPortal>
      )}
      {selectedGroup && (
        <MapSheetPortal key={selectedGroup.id}>
          <MapBottomSheet
            adaptive
            previewHeight={48}
            className={`cp-hotspot-sheet ${styles.sheet}`}
            label="กลุ่มจุดความร้อนจากดาวเทียม"
            onClose={() => priority?.clear()}
            header={
              <>
                <h2>
                  จุดความร้อน {selectedGroup.stations.length} จุดในบริเวณนี้
                </h2>
                <p>
                  จำนวนจุดตรวจพบ ไม่ใช่จำนวนเหตุไฟไหม้ ·
                  เลือกจุดเพื่อดูรายละเอียด
                </p>
              </>
            }
          >
            <ul className={styles.list}>
              {selectedGroup.stations.map((f, i) => (
                <li key={f.id}>
                  <button
                    className="cp-focus"
                    onClick={() => priority?.select(`hotspot:${f.id}`)}
                  >
                    จุดที่ {i + 1} · {hotspotSatellite(f.satellite)}
                    <span>
                      {f.lat.toFixed(5)}, {f.lon.toFixed(5)} · FRP{" "}
                      {f.frp == null ? "ไม่ระบุ" : `${f.frp} MW`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </MapBottomSheet>
        </MapSheetPortal>
      )}
    </>
  );
}
