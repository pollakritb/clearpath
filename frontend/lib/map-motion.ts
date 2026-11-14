import type {
  FitBoundsOptions,
  LatLngBoundsExpression,
  LatLngExpression,
  Map,
} from "leaflet";

/** One camera transition for navigation, clustering, GPS and zoom controls. */
export const MAP_MOTION_SECONDS = 0.65;

export function mapMotionOptions() {
  return {
    animate:
      typeof window === "undefined" ||
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    duration: MAP_MOTION_SECONDS,
  };
}

export function flyMapTo(map: Map, center: LatLngExpression, zoom: number) {
  return map.flyTo(center, zoom, mapMotionOptions());
}

export function flyMapToBounds(
  map: Map,
  bounds: LatLngBoundsExpression,
  options: FitBoundsOptions = {},
) {
  return map.flyToBounds(bounds, { ...options, ...mapMotionOptions() });
}
