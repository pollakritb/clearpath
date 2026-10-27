import L from "leaflet";
import { SVGOverlay } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import type { HeatmapPoint } from "@/frontend/lib/nearest-surface";

// The fade only highlights the nearest measurement. It does not interpolate
// PM2.5 values across the surrounding area.
const DISPLAY_RADIUS_METERS = 12_000;
const GRADIENT_ID = "cp-nearest-reading-gradient";

export default function NearestHeatmap({ point }: { point: HeatmapPoint }) {
  const color = classifyPm25(point.pm25).color;
  const bounds = L.latLng(point.lat, point.lon).toBounds(
    DISPLAY_RADIUS_METERS * 2,
  );

  return (
    <SVGOverlay
      bounds={bounds}
      interactive={false}
      attributes={{ viewBox: "0 0 100 100", "aria-hidden": "true" }}
    >
      <defs>
        <radialGradient id={GRADIENT_ID} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.46" />
          <stop offset="30%" stopColor={color} stopOpacity="0.34" />
          <stop offset="60%" stopColor={color} stopOpacity="0.18" />
          <stop offset="85%" stopColor={color} stopOpacity="0.05" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${GRADIENT_ID})`} />
    </SVGOverlay>
  );
}
