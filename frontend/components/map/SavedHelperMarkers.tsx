"use client";
import PriorityMarker from "./PriorityMarker";
import L from "leaflet";
import { createPortal } from "react-dom";
import { useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { HELPER_LOCATIONS_CHANGED } from "@/frontend/lib/measurement-events";
import HelperLocationEditor from "@/frontend/components/measurement/HelperLocationEditor";
import type { MeasurementHelperLocationWrite } from "@/frontend/types";
import { Popup } from "react-leaflet";
import type { MeasurementHelperLocation } from "@/frontend/types";
import { helperLocationEmoji } from "@/frontend/lib/helper-location-emoji";

export default function SavedHelperMarkers({
  locations,
  onSelect,
}: {
  locations: MeasurementHelperLocation[];
  onSelect?: () => void;
}) {
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
        >
          <Popup minWidth={180} className="cp-saved-helper-popup">
            <strong>{place.name}</strong>
            <br />
            สถานที่ที่บันทึก · เฉพาะคุณ
            <button
              type="button"
              className="cp-saved-helper-popup__edit cp-focus"
              onClick={() => {
                setError("");
                setEditing(place);
              }}
            >
              แก้ไขสถานที่
            </button>
          </Popup>
        </PriorityMarker>
      ))}
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
