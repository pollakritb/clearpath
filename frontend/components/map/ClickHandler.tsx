"use client";

import { useMapEvents } from "react-leaflet";

// ดักคลิกบนแผนที่ → ส่งพิกัดกลับไปตั้งหมุดต้นทาง/ปลายทาง
export default function ClickHandler({
  onClick,
}: {
  onClick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
