"use client";

import Image from "next/image";
import { useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { classifyPm25 } from "@/frontend/lib/aqi";
import { T } from "@/frontend/lib/ui";
import type { CommunityReport } from "@/frontend/types";

interface ReviewerLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export default function ReviewQueue({ onRefresh }: { onRefresh: () => void }) {
  const [nearby, setNearby] = useState<CommunityReport[]>([]);
  const [location, setLocation] = useState<ReviewerLocation | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function loadNearby() {
    setError(null);
    setMessage(null);
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        if (nextLocation.accuracy > 200) {
          setLoading(false);
          setError(
            "GPS คลาดเคลื่อนเกิน 200 เมตร กรุณาออกไปยังพื้นที่เปิดแล้วลองใหม่",
          );
          return;
        }
        setLocation(nextLocation);
        try {
          const result = await api.reviewQueue(
            nextLocation.lat,
            nextLocation.lon,
          );
          setNearby(result.reports);
        } catch (cause) {
          setError(apiErrorMessage(cause, "โหลดรายงานใกล้เคียงไม่สำเร็จ"));
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setError("กรุณาอนุญาต GPS เพื่อยืนยันว่าคุณอยู่ภายใน 3 กม. จากรายงาน");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function rate(reportId: string, rating: 1 | 2 | 3 | 4 | 5) {
    if (!location) return;
    setSavingId(reportId);
    setError(null);
    setMessage(null);
    try {
      const result = await api.rateReport(reportId, {
        rating,
        reviewer_lat: location.lat,
        reviewer_lon: location.lon,
        gps_accuracy_m: location.accuracy,
      });
      setNearby((current) =>
        current.filter((report) => report.id !== reportId),
      );
      setMessage(
        result.reward_points > 0
          ? `บันทึก ${rating} ดาวแล้ว คุณได้รับ ${result.reward_points} คะแนนจาก consensus`
          : `บันทึก ${rating} ดาวแล้ว ระบบจะให้รางวัลเมื่อมีอย่างน้อย 3 คนและเกิด consensus`,
      );
      onRefresh();
    } catch (cause) {
      setError(apiErrorMessage(cause, "ให้คะแนนรายงานไม่สำเร็จ"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
      <h2 style={{ margin: "0 0 .35em", fontSize: ".95em" }}>
        ช่วยประเมินความใกล้เคียง
      </h2>
      <p style={{ margin: "0 0 .6em", fontSize: ".7em", color: T.subInk }}>
        1 ดาว = ต่างมาก, 3 ดาว = ไม่แน่ใจ, 5 ดาว = ใกล้เคียงมาก
        เฉพาะรายงานที่อนุมัติแล้ว อายุไม่เกิน 3 ชั่วโมง และอยู่ภายใน 3 กม.
      </p>
      <button
        type="button"
        onClick={loadNearby}
        disabled={loading}
        className="cp-focus"
        style={{
          width: "100%",
          minHeight: "42px",
          border: "none",
          borderRadius: "9px",
          background: T.teal,
          color: "#fff",
          fontFamily: "inherit",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {loading
          ? "กำลังค้นหารายงานใกล้เคียง…"
          : "◎ ใช้ GPS เพื่อดูรายงานใกล้เคียง"}
      </button>

      {nearby.map((report) => {
        const value = report.pm25 ?? 0;
        const classification = classifyPm25(value);
        return (
          <article
            key={report.id}
            style={{
              border: `1px solid ${T.line}`,
              borderRadius: "11px",
              padding: ".7em",
              marginTop: ".55em",
            }}
          >
            {report.image_url && (
              <Image
                unoptimized
                src={report.image_url}
                alt="ภาพเครื่องวัดที่ Admin ตรวจแล้ว"
                width={640}
                height={360}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "150px",
                  objectFit: "contain",
                  background: "#111",
                  borderRadius: "8px",
                  marginBottom: ".5em",
                }}
              />
            )}
            <div
              style={{ display: "flex", alignItems: "baseline", gap: ".35em" }}
            >
              <b
                style={{
                  fontFamily: T.mono,
                  fontSize: "1.45em",
                  color: classification.color,
                }}
              >
                {value}
              </b>
              <span style={{ fontSize: ".68em" }}>
                µg/m³ · Trust {report.trust_score}
              </span>
            </div>
            <div style={{ fontSize: ".66em", color: T.subInk }}>
              ค่าขณะวัดที่ Admin อ่านจากภาพ · {report.rating_count} คะแนน
              {report.rating_average != null
                ? ` · เฉลี่ย ${report.rating_average.toFixed(1)} ดาว`
                : ""}
            </div>
            <div aria-label="ให้คะแนนความใกล้เคียง" className="cp-rating-grid">
              {([1, 2, 3, 4, 5] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  disabled={savingId === report.id}
                  onClick={() => void rate(report.id, rating)}
                  aria-label={`ให้ ${rating} ดาว`}
                  className="cp-focus"
                  style={{
                    minHeight: "42px",
                    border: `1px solid ${T.line}`,
                    borderRadius: "8px",
                    background:
                      rating >= 4
                        ? "rgba(43,191,115,.13)"
                        : rating <= 2
                          ? "rgba(224,85,75,.12)"
                          : T.chip,
                    color: T.ink,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {rating}★
                </button>
              ))}
            </div>
          </article>
        );
      })}

      {location && !loading && nearby.length === 0 && (
        <p style={{ fontSize: ".74em", color: T.subInk }}>
          ไม่มีรายงานที่รอการประเมินภายใน 3 กม.
        </p>
      )}
      {message && (
        <p role="status" style={{ fontSize: ".72em", color: T.teal }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: ".72em", color: "#c2433a" }}>
          {error}
        </p>
      )}
    </div>
  );
}
