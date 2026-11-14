/** Source timestamps and source age are distinct from ingestion/refresh time. */
export function sourceTimeLabel(value: string | null | undefined): string {
  const time = Date.parse(value ?? "");
  if (!Number.isFinite(time)) return "ไม่ทราบเวลาข้อมูล";
  return new Date(time).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readingAgeLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0)
    return "ไม่ทราบเวลาข้อมูล";
  const elapsed = Math.floor(minutes);
  if (elapsed < 60) return `${elapsed} นาทีที่แล้ว`;
  return `${Math.floor(elapsed / 60)} ชม. ${elapsed % 60} นาทีที่แล้ว`;
}
