import boundary from "@/frontend/lib/geo/thailand-boundary.json";

const mercator = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
/** Project the country boundary into the actual overlay extent. */
export function thailandClipPath(bounds: [[number, number], [number, number]]) {
  const [[south, west], [northLat, east]] = bounds;
  const north = mercator(northLat),
    span = north - mercator(south);
  return boundary.coordinates
    .flatMap((polygon) =>
      polygon.map(
        (ring) =>
          ring
            .map(
              ([lon, lat], index) =>
                `${index ? "L" : "M"}${((lon - west) / (east - west)).toFixed(7)},${((north - mercator(lat)) / span).toFixed(7)}`,
            )
            .join("") + "Z",
      ),
    )
    .join("");
}

export const THAILAND_CLIP_PATH = thailandClipPath([
  [5, 97],
  [21, 106],
]);

function inRing(ring: number[][], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [previousX, previousY] = ring[j];
    if (
      y > lat !== previousY > lat &&
      lon < ((previousX - x) * (lat - y)) / (previousY - y) + x
    )
      inside = !inside;
  }
  return inside;
}

/** Same multipolygon as the visual clip, including islands and polygon holes. */
export function isInThailand(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < 5 || lat > 21 || lon < 97 || lon > 106) return false;
  return boundary.coordinates.some(
    ([outer, ...holes]) =>
      inRing(outer, lat, lon) && !holes.some((hole) => inRing(hole, lat, lon)),
  );
}
