// Keep multipart requests below Vercel's 4.5 MB Function payload ceiling.
// Originals retain their EXIF; no lossy client-side recompression.
export const MAX_IMAGE_BYTES = 4_000_000;
export function uploadSizeError(body: FormData): string | null {
  let bytes = 0;
  for (const value of body.values())
    bytes +=
      typeof value === "string"
        ? new TextEncoder().encode(value).length
        : value.size;
  return bytes > MAX_IMAGE_BYTES
    ? "ภาพและข้อมูลที่ส่งรวมกันต้องไม่เกิน 4 MB กรุณาเลือกภาพที่เล็กลงหรือลดภาพเสริม"
    : null;
}
