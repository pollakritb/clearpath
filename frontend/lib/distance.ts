const EARTH_KM = 6371.0088;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180;
  const dlat = (lat2 - lat1) * rad;
  const dlon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}
