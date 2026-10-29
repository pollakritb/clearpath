"use client";

import L from "leaflet";
import { Fragment } from "react";
import { Circle, Marker, Tooltip } from "react-leaflet";
import {
  escapeMarkerText,
  requestPlaceParts,
} from "@/frontend/lib/request-place";
import type { MeasurementRequestView, RequestStatus } from "@/frontend/types";
import {
  REQUEST_MARKER_STATES,
  requestMapStatus,
} from "@/frontend/lib/request-map";

function requestIcon(status: RequestStatus, name: string) {
  const state = REQUEST_MARKER_STATES[status];
  return L.divIcon({
    className: "cp-request-marker",
    html: `<span class="cp-request-marker__pin" style="--request-color:${state.color}"><span>${state.symbol}</span></span><span class="cp-request-marker__label"><strong>${escapeMarkerText(name)}</strong><small>คำขอ · ${state.label}</small></span>`,
    iconSize: [40, 56],
    iconAnchor: [20, 39],
    tooltipAnchor: [0, -36],
  });
}

export default function RequestMarkers({
  requests,
  selectedId,
  now,
  onSelect,
}: {
  requests: MeasurementRequestView[];
  selectedId?: string | null;
  now: number;
  onSelect?: (request: MeasurementRequestView) => void;
}) {
  return (
    <>
      {requests.map((row) => {
        const state = requestMapStatus(row, now);
        const selected = selectedId === row.id;
        const place = requestPlaceParts(row.place_name);
        return (
          <Fragment key={row.id}>
            {selected && (
              <Circle
                center={[row.lat, row.lon]}
                radius={row.radius_km * 1000}
                interactive={false}
                pathOptions={{
                  color: REQUEST_MARKER_STATES[state].color,
                  weight: 2,
                  dashArray: "6 6",
                  fillOpacity: 0.06,
                }}
              />
            )}
            <Marker
              position={[row.lat, row.lon]}
              icon={requestIcon(state, place.shortName)}
              title={`${row.is_owner ? "คำขอของคุณ" : "คำขอให้ช่วยวัด"} · ${place.title} · ${REQUEST_MARKER_STATES[state].label}`}
              alt={`จุดขอค่าฝุ่น ${place.title}`}
              bubblingMouseEvents={false}
              zIndexOffset={selected ? 1600 : 1100}
              eventHandlers={{ click: () => onSelect?.(row) }}
            >
              <Tooltip direction="top">
                <strong>{place.title}</strong>
                {place.address && (
                  <>
                    <br />
                    {place.address}
                  </>
                )}
                <br />
                {row.is_owner ? "คำขอของคุณ" : "คำขอให้ช่วยวัด"} · วง{" "}
                {row.radius_km} กม.
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}
