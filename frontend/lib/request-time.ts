/** Whole-minute request countdown; all timestamps remain timezone-aware. */
export function formatRequestDuration(minutes: number): string {
  const value = Math.max(0, Math.ceil(minutes));
  if (value <= 60) return `${value} นาที`;
  const hours = Math.floor(value / 60);
  const remaining = value % 60;
  return remaining ? `${hours} ชั่วโมง ${remaining} นาที` : `${hours} ชั่วโมง`;
}
