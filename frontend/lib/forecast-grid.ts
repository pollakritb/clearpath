import type {
  ForecastGridFrames,
  ForecastGridMetadata,
} from "@/frontend/types";
import type { GridSurface, ViewportBounds } from "@/frontend/types/ui";

const keyTime = (at: string) => new Date(at).getTime();
export function forecastTimes(meta: ForecastGridMetadata, now = Date.now()) {
  const floor = Math.floor(now / 3_600_000) * 3_600_000;
  return meta.valid_times.filter((at) => keyTime(at) >= floor);
}
export function nearestTime(times: string[], desired: string | number) {
  const target = typeof desired === "number" ? desired : keyTime(desired);
  return times.reduce<string | null>(
    (best, at) =>
      best === null ||
      Math.abs(keyTime(at) - target) < Math.abs(keyTime(best) - target)
        ? at
        : best,
    null,
  );
}
export function normalizeGridBounds(
  bounds: ViewportBounds | null,
): ViewportBounds | null {
  if (!bounds) return { min_lat: 5, max_lat: 21, min_lon: 97, max_lon: 106 };
  const result = {
    min_lat: Math.max(5, Math.floor(bounds.min_lat / 0.4) * 0.4),
    max_lat: Math.min(21, Math.ceil(bounds.max_lat / 0.4) * 0.4),
    min_lon: Math.max(97, Math.floor(bounds.min_lon / 0.4) * 0.4),
    max_lon: Math.min(106, Math.ceil(bounds.max_lon / 0.4) * 0.4),
  };
  return result.min_lat < result.max_lat && result.min_lon < result.max_lon
    ? result
    : null;
}
export function surfaceFor(
  meta: ForecastGridMetadata,
  data: ForecastGridFrames,
  at: string,
): GridSurface | null {
  if (
    data.generation_id !== meta.generation_id ||
    data.grid_version !== meta.grid_version
  )
    return null;
  const frame = data.frames.find((f) => keyTime(f.valid_at) === keyTime(at));
  if (!frame || frame.values.length !== data.rows * data.columns) return null;
  return {
    latitudes: meta.latitudes.slice(data.row_start, data.row_start + data.rows),
    longitudes: meta.longitudes.slice(
      data.column_start,
      data.column_start + data.columns,
    ),
    values: frame.values,
    validAt: at,
    generationId: data.generation_id,
  };
}
/** Interpolate concentration first. Missing corners with positive weight yield no data. */
export function gridValue(
  surface: GridSurface,
  lat: number,
  lon: number,
): number | null {
  if (lat < 5 || lat > 21 || lon < 97 || lon > 106) return null;
  const a = surface.latitudes,
    b = surface.longitudes;
  if (
    a.length < 2 ||
    b.length < 2 ||
    lat < a[0] ||
    lat > a[a.length - 1] ||
    lon < b[0] ||
    lon > b[b.length - 1]
  )
    return null;
  const row = Math.min(
    a.length - 2,
    Math.max(0, a.findIndex((v) => v >= lat) - 1),
  );
  const col = Math.min(
    b.length - 2,
    Math.max(0, b.findIndex((v) => v >= lon) - 1),
  );
  const y = (lat - a[row]) / (a[row + 1] - a[row]),
    x = (lon - b[col]) / (b[col + 1] - b[col]);
  return sampleGridCell(surface.values, b.length, row, col, x, y);
}
/** Shared by the exact point sampler and raster renderer. Zero-weight missing nodes are harmless. */
export function sampleGridCell(
  values: (number | null)[],
  columns: number,
  row: number,
  col: number,
  x: number,
  y: number,
): number | null {
  const index = row * columns + col;
  const a = values[index],
    b = values[index + 1],
    c = values[index + columns],
    d = values[index + columns + 1];
  const wa = (1 - x) * (1 - y),
    wb = x * (1 - y),
    wc = (1 - x) * y,
    wd = x * y;
  if (
    (wa > 1e-10 && (a == null || !Number.isFinite(a) || a < 0)) ||
    (wb > 1e-10 && (b == null || !Number.isFinite(b) || b < 0)) ||
    (wc > 1e-10 && (c == null || !Number.isFinite(c) || c < 0)) ||
    (wd > 1e-10 && (d == null || !Number.isFinite(d) || d < 0))
  )
    return null;
  return (
    (wa > 1e-10 ? a! * wa : 0) +
    (wb > 1e-10 ? b! * wb : 0) +
    (wc > 1e-10 ? c! * wc : 0) +
    (wd > 1e-10 ? d! * wd : 0)
  );
}

export function bangkokDay(at: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}
export function formatForecastTime(at: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}
