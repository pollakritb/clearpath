import type { LocationSuggestion } from "@/frontend/types";

export const UNKNOWN_REQUEST_PLACE = "พื้นที่ที่ขอวัดค่าฝุ่น";
const clean = (value: string | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();
export function requestPlaceTitle(name: string) {
  const value = clean(name);
  if (
    !value ||
    ["จุดที่เลือกบนแผนที่", "จุดที่เลือก", UNKNOWN_REQUEST_PLACE].includes(
      value,
    )
  )
    return UNKNOWN_REQUEST_PLACE;
  return value.startsWith("บริเวณ") ? value : `บริเวณ${value}`;
}
/** Keep title + supporting area in the existing bounded text field, separated by a newline. */
export function storedRequestPlace(
  place: Pick<LocationSuggestion, "name" | "address">,
) {
  const title = requestPlaceTitle(place.name).slice(0, 130);
  const area = clean(place.address).slice(0, 159 - title.length);
  return area ? `${title}\n${area}` : title;
}
export function requestPlaceParts(stored: string) {
  const [name, ...area] = stored.split(/\r?\n/);
  const title = requestPlaceTitle(name);
  const shortName =
    title === UNKNOWN_REQUEST_PLACE
      ? "พื้นที่ขอค่าฝุ่น"
      : title
          .replace(/^บริเวณ\s*/, "")
          .replace(/^มหาวิทยาลัย/, "ม.")
          .replace(/วิทยาเขต\s*/, "")
          .replace(/เกษตรศาสตร์/, "เกษตรฯ");
  return { title, address: clean(area.join(" · ")), shortName };
}
export function escapeMarkerText(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
