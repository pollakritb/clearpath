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
  return minutes < 120
    ? `${Math.round(minutes)} นาทีที่แล้ว`
    : `${Math.round(minutes / 60)} ชม.ที่แล้ว`;
}
