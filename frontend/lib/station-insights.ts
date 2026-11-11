import type { HistoryPoint } from "@/frontend/types";

const HOUR = 3_600_000;
export function stationHistorySlots(points: HistoryPoint[], reference: number) {
  const end = Math.floor(reference / HOUR) * HOUR;
  const slots: {
    at: number;
    value: number | null;
    recordedAt: string | null;
  }[] = Array.from({ length: 24 }, (_, i) => ({
    at: end - (23 - i) * HOUR,
    value: null,
    recordedAt: null,
  }));
  for (const p of points) {
    const at = Date.parse(p.recorded_at);
    const index = (Math.floor(at / HOUR) * HOUR - slots[0].at) / HOUR;
    if (
      !Number.isFinite(at) ||
      at > reference ||
      index < 0 ||
      index >= slots.length ||
      p.pm25 == null ||
      !Number.isFinite(p.pm25) ||
      p.pm25 < 0
    )
      continue;
    const slot = slots[index];
    if (!slot.recordedAt || at >= Date.parse(slot.recordedAt)) {
      slot.value = p.pm25;
      slot.recordedAt = p.recorded_at;
    }
  }
  return slots;
}
export function stationHistorySummary(
  slots: ReturnType<typeof stationHistorySlots>,
) {
  const valid = slots.filter((s) => s.value != null);
  const last = slots.findLastIndex((s) => s.value != null);
  const delta =
    last > 0 && slots[last - 1].value != null
      ? slots[last].value! - slots[last - 1].value!
      : null;
  return {
    count: valid.length,
    min: valid.length ? Math.min(...valid.map((s) => s.value!)) : null,
    max: valid.length ? Math.max(...valid.map((s) => s.value!)) : null,
    delta,
  };
}
