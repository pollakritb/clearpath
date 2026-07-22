"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { CommunityReport } from "@/frontend/types";

function reportIcon(color: string, trust: number) {
  const size = trust >= 75 ? 27 : 23;
  return L.divIcon({
    className: "cp-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:8px 8px 8px 2px;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:800">ช</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

export default function ReportMarkers({
  reports,
}: {
  reports: CommunityReport[];
}) {
  return (
    <>
      {reports.map((report) => {
        if (report.pm25 == null) return null;
        const cls = classifyPm25(report.pm25);
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lon]}
            icon={reportIcon(cls.color, report.trust_score)}
          >
            <Popup>
              <div style={{ fontFamily: "inherit", minWidth: "11em" }}>
                <div style={{ fontWeight: 700 }}>Community Report</div>
                <div style={{ fontSize: ".68em", color: T.subInk }}>
                  ค่าขณะวัด (Instantaneous) · ไม่ใช่ค่าเฉลี่ย 24 ชั่วโมง
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: ".35em",
                    margin: ".35em 0",
                  }}
                >
                  <b
                    style={{
                      fontFamily: T.mono,
                      fontSize: "1.7em",
                      color: cls.color,
                    }}
                  >
                    {report.pm25}
                  </b>
                  <span style={{ fontSize: ".75em" }}>µg/m³</span>
                </div>
                <div style={{ fontSize: ".78em", color: T.subInk }}>
                  Trust {report.trust_score}/100 ·{" "}
                  {report.display_name ?? "สมาชิกชุมชน"}
                </div>
                <div
                  style={{
                    fontSize: ".7em",
                    color: T.subInk,
                    marginTop: ".2em",
                  }}
                >
                  วัดเมื่อ{" "}
                  {report.age_minutes == null
                    ? "ไม่ทราบ"
                    : `${Math.round(report.age_minutes)} นาทีที่แล้ว`}{" "}
                  · ตำแหน่งสาธารณะคลาดเคลื่อนประมาณ{" "}
                  {report.location_precision_m} ม.
                </div>
                <div
                  style={{
                    fontSize: ".72em",
                    color: T.subInk,
                    marginTop: ".2em",
                  }}
                >
                  {report.data_role === "supplementary"
                    ? `ข้อมูลเสริม · Air4Thai ใกล้สุด ${report.nearest_official_distance_km?.toFixed(1) ?? "–"} กม.`
                    : report.eligible_for_gap_fill
                      ? "ผ่านเกณฑ์เติมพื้นที่ที่ไม่มี Air4Thai"
                      : "พื้นที่ไม่มี Air4Thai ใกล้เคียง · ยังไม่ใช้คำนวณพื้นผิว"}
                </div>
                <div
                  style={{
                    fontSize: ".7em",
                    color: report.eligible_for_gap_fill ? "#167a4a" : T.subInk,
                    marginTop: ".2em",
                    fontWeight: 600,
                  }}
                >
                  {report.eligibility_reason}
                </div>
                <div
                  style={{
                    fontSize: ".69em",
                    color: T.subInk,
                    marginTop: ".2em",
                  }}
                >
                  เครื่อง: {report.device_model ?? "ไม่ระบุ"}
                  {report.device_calibrated ? " · มีข้อมูลสอบเทียบ" : ""} ·
                  ผู้รายงานสอดคล้อง {report.corroboration_count} คน
                </div>
                <div
                  style={{
                    fontSize: ".69em",
                    color: T.subInk,
                    marginTop: ".2em",
                  }}
                >
                  ค่าจากภาพที่ Admin ตรวจแล้ว · {report.rating_count} คะแนน
                  {report.rating_average != null
                    ? ` · เฉลี่ย ${report.rating_average.toFixed(1)} ดาว`
                    : ""}
                </div>
                {report.near_emission_source && (
                  <div
                    style={{
                      fontSize: ".69em",
                      color: "#b53d35",
                      marginTop: ".2em",
                    }}
                  >
                    จุดวัดอยู่ติดแหล่งควันโดยตรง จึงไม่ใช้กับ IDW
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
