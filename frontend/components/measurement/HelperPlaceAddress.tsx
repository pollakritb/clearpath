"use client";

import { useRequestPlaceLabel } from "@/frontend/hooks/useRequestPlaceLabel";
import { locationLabelAddress } from "@/frontend/lib/request-place";
import type { MeasurementHelperLocation } from "@/frontend/types";

/** Resolve saved coordinates without changing the owner's custom name or data. */
export default function HelperPlaceAddress({
  place,
}: {
  place: MeasurementHelperLocation;
}) {
  const { point, loading } = useRequestPlaceLabel(
    {
      id: `helper-area-${place.slot}`,
      kind: "point",
      source: "local",
      name: "จุดที่เลือก",
      address: "",
      lat: place.lat,
      lon: place.lon,
    },
    true,
  );
  const address = point ? locationLabelAddress(point) : "";
  return (
    <small aria-live="polite">
      {loading
        ? "กำลังระบุพื้นที่…"
        : address ||
          place.address ||
          `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`}
    </small>
  );
}
