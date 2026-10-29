import { api } from "@/frontend/lib/api-client";
import type {
  ForecastGridFrames,
  ForecastGridMetadata,
} from "@/frontend/types";

/** The entire 0.4° national grid is only 1,144 nodes. Cache at most two horizons. */
const packets = new Map<string, ForecastGridFrames>();
const pending = new Map<string, Promise<ForecastGridFrames>>();
const BOUNDS = { min_lat: 5, max_lat: 21, min_lon: 97, max_lon: 106 };
export function gridWindows(meta: ForecastGridMetadata): string[][] {
  const groups = new Map<number, string[]>();
  for (const at of meta.valid_times) {
    const bucket = Math.floor(Date.parse(at) / (6 * 3600000));
    const times = groups.get(bucket) ?? [];
    times.push(at);
    groups.set(bucket, times);
  }
  return [...groups.values()];
}
export function gridWindow(meta: ForecastGridMetadata, at: string) {
  return gridWindows(meta).find((times) => times.includes(at)) ?? [];
}
function key(meta: ForecastGridMetadata, times: string[]) {
  return `${meta.generation_id}:${meta.grid_version}:${times[0]}:${times.at(-1)}`;
}
export function cachedGridWindow(meta: ForecastGridMetadata, at: string) {
  return packets.get(key(meta, gridWindow(meta, at)));
}
export function preparedGridFrames(
  meta: ForecastGridMetadata,
  times = meta.valid_times,
) {
  return times.filter((at) => cachedGridWindow(meta, at)).length;
}

export function loadGridWindow(
  meta: ForecastGridMetadata,
  times: string[],
): Promise<ForecastGridFrames> {
  if (!meta.generation_id || !times.length)
    return Promise.reject(new Error("grid window unavailable"));
  const id = key(meta, times),
    hit = packets.get(id);
  if (hit) return Promise.resolve(hit);
  const existing = pending.get(id);
  if (existing) return existing;
  const work = api
    .forecastGridFrames(meta.generation_id, times[0], times.at(-1)!, BOUNDS)
    .then((data) => {
      if (
        data.generation_id !== meta.generation_id ||
        data.grid_version !== meta.grid_version ||
        data.row_start !== 0 ||
        data.column_start !== 0 ||
        data.rows !== meta.latitudes.length ||
        data.columns !== meta.longitudes.length ||
        data.frames.some((f) => f.values.length !== data.rows * data.columns)
      )
        throw Error("grid generation or geometry mismatch");
      packets.delete(id);
      packets.set(id, data);
      while (packets.size > 40) packets.delete(packets.keys().next().value!);
      return data;
    })
    .finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
}
