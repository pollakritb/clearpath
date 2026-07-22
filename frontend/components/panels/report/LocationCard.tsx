import { T } from "@/frontend/lib/ui";
import type { ReportLocation } from "@/frontend/types/ui";

interface LocationCardProps {
  location: ReportLocation | null;
  onRequestLocation: () => void;
}

export default function LocationCard({
  location,
  onRequestLocation,
}: LocationCardProps) {
  const hasGps = location?.source === "gps";
  let description = "ยังไม่ได้รับตำแหน่งจากอุปกรณ์";
  if (hasGps) {
    description = `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · ±${Math.round(location.accuracy ?? 0)} ม.`;
  } else if (location?.source === "map") {
    description = "หมุดจากการแตะแผนที่ใช้ส่งไม่ได้ กรุณาใช้ GPS";
  }

  return (
    <div
      style={{
        border: `1px solid ${hasGps ? T.teal : T.line}`,
        borderRadius: "10px",
        padding: ".65em",
        background: hasGps ? "rgba(14,124,121,.07)" : T.chip,
      }}
    >
      <div style={{ fontSize: ".72em", fontWeight: 700 }}>
        ตำแหน่ง GPS อัตโนมัติ
      </div>
      <div
        style={{
          fontSize: ".68em",
          color: hasGps ? T.teal : T.subInk,
          marginTop: ".15em",
        }}
      >
        {description}
      </div>
      {!hasGps && (
        <button
          type="button"
          onClick={onRequestLocation}
          className="cp-focus"
          style={{
            marginTop: ".45em",
            border: "none",
            borderRadius: "8px",
            padding: ".55em .75em",
            background: T.teal,
            color: "#fff",
            fontFamily: "inherit",
            fontWeight: 700,
          }}
        >
          ◎ ขอสิทธิ์ GPS อีกครั้ง
        </button>
      )}
    </div>
  );
}
