"use client";
import PriorityMarker, { useMarkerPriority } from "./PriorityMarker";
import MapSheetPortal from "./MapSheetPortal";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
import L from "leaflet";
import { createPortal } from "react-dom";
import { useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { HELPER_LOCATIONS_CHANGED } from "@/frontend/lib/measurement-events";
import HelperLocationEditor from "@/frontend/components/measurement/HelperLocationEditor";
import type { MeasurementHelperLocationWrite } from "@/frontend/types";

import type { MeasurementHelperLocation } from "@/frontend/types";
import { helperLocationEmoji } from "@/frontend/lib/helper-location-emoji";

export default function SavedHelperMarkers({
  locations,
  onSelect,
}: {
  locations: MeasurementHelperLocation[];
  onSelect?: () => void;
}) {
  const priority = useMarkerPriority();
  const selected = locations.find(
    (place) => priority?.active === `saved:${place.slot}`,
  );
  const [editing, setEditing] = useState<MeasurementHelperLocation | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(value: MeasurementHelperLocationWrite, slot?: 1 | 2) {
    setBusy(true);
    setError("");
    try {
      await api.saveMeasurementLocation(value, slot);
      window.dispatchEvent(new Event(HELPER_LOCATIONS_CHANGED));
      setEditing(null);
    } catch (cause) {
      setError(apiErrorMessage(cause, "บันทึกสถานที่ไม่สำเร็จ ลองอีกครั้ง"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {locations.map((place) => (
        <PriorityMarker
          priorityId={`saved:${place.slot}`}
          key={place.slot}
          eventHandlers={{ click: () => onSelect?.() }}
          zIndexOffset={1000}
          position={[place.lat, place.lon]}
          title={`สถานที่ของฉัน: ${place.name}`}
          alt={`สถานที่ของฉัน: ${place.name}`}
          icon={L.divIcon({
            className: "cp-saved-helper-marker",
            html: `<span>${helperLocationEmoji(place.emoji)}</span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 44],
            popupAnchor: [0, -42],
          })}
        />
      ))}
      {selected && (
        <MapSheetPortal>
          <MapBottomSheet
            className="cp-saved-sheet"
            label="สถานที่ที่บันทึกไว้"
            onClose={() => priority?.clear()}
            header={
              <>
                <h2>
                  {helperLocationEmoji(selected.emoji)} {selected.name}
                </h2>
                <p>สถานที่ที่บันทึก · เฉพาะคุณ</p>
              </>
            }
          >
            <p>{selected.address}</p>
            <p>
              {selected.enabled
                ? "เปิดรับคำขอในพื้นที่นี้"
                : "พักรับคำขอในพื้นที่นี้"}
            </p>
            <button
              type="button"
              className="cp-saved-helper-popup__edit cp-focus"
              onClick={() => {
                setError("");
                setEditing(selected);
              }}
            >
              แก้ไขสถานที่และสัญลักษณ์
            </button>
          </MapBottomSheet>
        </MapSheetPortal>
      )}
      {editing &&
        createPortal(
          <HelperLocationEditor
            initial={editing}
            first={false}
            busy={busy}
            error={error}
            onSave={save}
            onClose={() => setEditing(null)}
          />,
          document.body,
        )}
    </>
  );
}
