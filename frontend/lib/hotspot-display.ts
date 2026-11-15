export function hotspotSatellite(product?: string | null) {
  if (!product) return "ไม่ระบุดาวเทียม";
  if (product.includes("NOAA20")) return "NOAA-20 · VIIRS";
  if (product.includes("NOAA21")) return "NOAA-21 · VIIRS";
  if (product.includes("SNPP")) return "Suomi NPP · VIIRS";
  return product;
}

export function hotspotConfidence(value?: string | null) {
  switch (value?.trim().toLowerCase()) {
    case "h":
    case "high":
      return "สูง";
    case "n":
    case "nominal":
      return "ปกติ";
    case "l":
    case "low":
      return "ต่ำ";
    default:
      return "ไม่ระบุ";
  }
}
