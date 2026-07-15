"use client";

import L from "leaflet";
import "leaflet.heat";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

// gradient ตามมาตรฐาน AQI (normalize ด้วย max ด้านล่าง)
const GRADIENT: Record<number, string> = {
  0.0: "#27ae60",
  0.3: "#d4ac0d",
  0.45: "#e67e22",
  0.65: "#e74c3c",
  0.85: "#8e44ad",
};

export default function Heatmap({
  points,
}: {
  points: Array<[number, number, number]>; // [lat, lon, pm25]
}) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    // max=100 จัด gradient ให้ตรงระดับ AQI (≈90 = ม่วง) · radius/minOpacity สูงขึ้น
    // เพื่อให้ "เห็นสนามฝุ่นชัด" แม้ค่าต่ำ (หน้าฝน) — พื้นที่ฝุ่นน้อยจะเป็นบลॉบเขียวที่มองเห็นได้
    const layer = L.heatLayer(points, {
      radius: 26,
      blur: 18,
      max: 100,
      minOpacity: 0.55,
      gradient: GRADIENT,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}
