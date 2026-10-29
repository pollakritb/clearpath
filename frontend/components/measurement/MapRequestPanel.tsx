"use client";

import Link from "next/link";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type { LocationSuggestion } from "@/frontend/types";
import CreateRequest from "./CreateRequest";

export default function MapRequestPanel({
  point,
  editing,
  onConfirm,
  onReselect,
  onClose,
  radius = 3,
  onRadiusChange,
}: {
  point: LocationSuggestion | null;
  editing: boolean;
  onConfirm: () => void;
  onReselect: () => void;
  onClose: () => void;
  radius?: 1 | 3 | 5;
  onRadiusChange?: (radius: 1 | 3 | 5) => void;
}) {
  return (
    <section
      className="cp-place-card cp-map-request-panel"
      aria-label="ขอค่าฝุ่นบนแผนที่"
    >
      <button
        type="button"
        className="cp-map-selection-card__close cp-focus"
        aria-label="ปิดการขอค่าฝุ่น"
        onClick={onClose}
      >
        <AppIcon name="close" size={19} />
      </button>
      <div className="cp-place-card__heading">
        <span className="cp-place-card__eyebrow">ขอค่าฝุ่นจากชุมชน</span>
        <h2>
          {editing
            ? "เลือกพื้นที่และเวลาที่ต้องการ"
            : "แตะแผนที่เพื่อเลือกจุดที่จะขอ"}
        </h2>
      </div>
      {point ? (
        <p className="cp-map-request-point">
          <strong>{point.name}</strong>
          <span>
            {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
          </span>
        </p>
      ) : (
        <p>
          เลื่อนหรือซูมแผนที่ แล้วแตะจุดที่ต้องการ
          หรือค้นหาสถานที่ด้วยปุ่มแว่นขยาย
        </p>
      )}
      {editing && point ? (
        <>
          <button
            className="cp-map-request-reselect cp-focus"
            type="button"
            onClick={onReselect}
          >
            เปลี่ยนจุดบนแผนที่
          </button>
          <CreateRequest
            key={`${point.lat}:${point.lon}`}
            place={point}
            initiallyOpen
            mapContext
            selectedRadius={radius}
            onRadiusChange={onRadiusChange}
          />
        </>
      ) : (
        <>
          {point && <p>แตะจุดอื่นได้จนกว่าจะยืนยัน ยังไม่ได้ส่งคำขอ</p>}
          <button
            className="cp-measure-primary cp-focus"
            type="button"
            disabled={!point}
            onClick={onConfirm}
          >
            ใช้จุดนี้เพื่อขอค่าฝุ่น
          </button>
        </>
      )}
      <Link href="/requests" className="cp-measure-link cp-focus">
        ดูคำขอของฉัน
      </Link>
    </section>
  );
}
