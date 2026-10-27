import { Circle } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import type { HeatmapPoint } from "@/frontend/lib/nearest-surface";

// The color is the measured PM2.5 category. The rings only fade its visual
// emphasis with distance; they do not estimate PM2.5 at other coordinates.
const RINGS = [
  { radius: 5000, opacity: 0.06 },
  { radius: 4000, opacity: 0.08 },
  { radius: 3000, opacity: 0.1 },
  { radius: 2000, opacity: 0.13 },
  { radius: 1000, opacity: 0.17 },
];

export default function NearestHeatmap({ point }: { point: HeatmapPoint }) {
  const color = classifyPm25(point.pm25).color;

  return (
    <>
      {RINGS.map(({ radius, opacity }) => (
        <Circle
          key={radius}
          center={[point.lat, point.lon]}
          radius={radius}
          interactive={false}
          pathOptions={{
            stroke: false,
            fillColor: color,
            fillOpacity: opacity,
          }}
        />
      ))}
    </>
  );
}
