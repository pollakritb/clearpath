"use client";

import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

import { idwValue, type IdwStation } from "@/frontend/lib/idw";
import type { Station } from "@/frontend/types";

// ไล่สี "สัมพัทธ์" ตามตำแหน่งค่าในชุดข้อมูลปัจจุบัน (t = 0..1)
// → เห็นชัดว่า "ตรงไหนฝุ่นเยอะกว่า" แม้ทั้งประเทศจะค่าต่ำใกล้กัน (วันอากาศดี)
// (ค่า µg/m³ จริง + ระดับ AQI ดูที่หมุดสถานี/การ์ดเสมอ)
const RAMP: [number, [number, number, number]][] = [
  [0.0, [39, 174, 96]], // เขียว — ต่ำสุดในขณะนั้น
  [0.4, [154, 205, 50]], // เขียว→เหลือง
  [0.65, [212, 172, 13]], // เหลือง
  [0.85, [230, 126, 34]], // ส้ม
  [1.0, [231, 76, 60]], // แดง — สูงสุดในขณะนั้น
];

function rampColor(t: number): [number, number, number] {
  if (t <= 0) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

// พื้นผิวค่าฝุ่นแบบ IDW — วาดทีละ tile (Leaflet จัดการ zoom/pan/แคชเอง)
// แก้ปัญหาของ leaflet.heat: สีตาม "ค่าจริงที่ interpolate" (ไม่ใช่ความหนาแน่นจุด)
// และครอบทั้งจอทุกระดับ zoom (ไม่เล็กลงเวลาซูมเข้า)
export default function IdwSurface({
  stations,
  min,
  max,
}: {
  stations: Station[];
  min: number; // ค่าต่ำสุดในชุดข้อมูลปัจจุบัน (สำหรับสเกลความทึบ)
  max: number; // ค่าสูงสุด
}) {
  const map = useMap();

  useEffect(() => {
    const pts: IdwStation[] = stations
      .filter((s) => s.pm25 != null)
      .map((s) => ({ lat: s.lat, lon: s.lon, pm25: s.pm25 as number }));
    if (!pts.length) return;

    const range = Math.max(1, max - min);
    const N = 20; // ความละเอียดต่อ tile (สเกลขึ้นแบบ smooth)

    const Surface = L.GridLayer.extend({
      createTile(this: L.GridLayer, coords: L.Coords) {
        const tile = document.createElement("canvas");
        const ts = this.getTileSize();
        tile.width = ts.x;
        tile.height = ts.y;
        tile.style.pointerEvents = "none"; // อย่าบังการคลิกแผนที่เพื่อเลือกจุดรายงาน
        const ctx = tile.getContext("2d");
        if (!ctx) return tile;

        const small = document.createElement("canvas");
        small.width = N;
        small.height = N;
        const sctx = small.getContext("2d");
        if (!sctx) return tile;
        const img = sctx.createImageData(N, N);

        const origin = coords.scaleBy(ts); // มุมซ้ายบนของ tile (พิกเซลที่ zoom = coords.z)
        const stepX = ts.x / N;
        const stepY = ts.y / N;

        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const px = origin.x + (i + 0.5) * stepX;
            const py = origin.y + (j + 0.5) * stepY;
            const ll = map.unproject(L.point(px, py), coords.z);
            const v = idwValue(ll.lat, ll.lng, pts);
            const o = (j * N + i) * 4;
            if (v == null) {
              img.data[o + 3] = 0;
              continue;
            }
            // t = ตำแหน่งสัมพัทธ์ในชุดข้อมูล → ใช้ทั้ง "สี" และ "ความทึบ"
            const t = Math.min(1, Math.max(0, (v - min) / range));
            const [r, g, b] = rampColor(t);
            img.data[o] = r;
            img.data[o + 1] = g;
            img.data[o + 2] = b;
            // โปร่งพอให้เห็นแผนที่และหมุด · ตรงที่สูงกว่าทึบขึ้นเล็กน้อย
            img.data[o + 3] = Math.round((0.4 + t * 0.25) * 255);
          }
        }

        sctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(small, 0, 0, ts.x, ts.y); // สเกลขึ้น smooth (bilinear)
        return tile;
      },
    }) as unknown as new (options?: L.GridLayerOptions) => L.GridLayer;

    const layer = new Surface({ tileSize: 256 });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, stations, min, max]);

  return null;
}
