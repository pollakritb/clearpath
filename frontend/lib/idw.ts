// IDW (Inverse Distance Weighting) ฝั่ง client — mirror ของ backend/algorithms/idw.py
// ใช้วาด "พื้นผิวค่าฝุ่น" บนแผนที่ (interpolate ค่า PM2.5 ทุกจุด ไม่ใช่แค่ density)

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

export interface IdwStation {
  lat: number;
  lon: number;
  pm25: number;
}

// ประมาณค่า PM2.5 ที่ (lat,lon) จาก k สถานีใกล้สุด · weight = 1/d^power
export function idwValue(
  lat: number,
  lon: number,
  stations: IdwStation[],
  power = 2,
  k = 5,
): number | null {
  if (!stations.length) return null;

  const dists: number[] = new Array(stations.length);
  for (let i = 0; i < stations.length; i++) {
    const d = haversineKm(lat, lon, stations[i].lat, stations[i].lon);
    if (d < 1e-9) return stations[i].pm25; // ตรงสถานีพอดี
    dists[i] = d;
  }

  // เลือก k ตัวที่ใกล้สุด
  const order = dists
    .map((d, i) => [d, i] as [number, number])
    .sort((a, b) => a[0] - b[0])
    .slice(0, k);

  let wsum = 0;
  let vsum = 0;
  for (const [d, i] of order) {
    const w = 1 / Math.pow(d, power);
    wsum += w;
    vsum += w * stations[i].pm25;
  }
  return vsum / wsum;
}
