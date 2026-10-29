"use client";

import Link from "next/link";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type {
  LocationSuggestion,
  MeasurementRequestView,
} from "@/frontend/types";
import CreateRequest from "./CreateRequest";
import { requestPlaceTitle } from "@/frontend/lib/request-place";

export default function MapRequestPanel({
  point,
  editing,
  onConfirm,
  onReselect,
  onClose,
  radius = 3,
  onRadiusChange,
  onCreated,
  resolvingName = false,
}: {
  point: LocationSuggestion | null;
  editing: boolean;
  onConfirm: () => void;
  onReselect: () => void;
  onClose: () => void;
  radius?: 1 | 3 | 5;
  onRadiusChange?: (radius: 1 | 3 | 5) => void;
  onCreated?: (request: MeasurementRequestView) => void;
  resolvingName?: boolean;
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
        <h2>{editing ? "ขอค่าฝุ่นบริเวณนี้" : "เลือกจุดบนแผนที่"}</h2>
      </div>
      <div className="cp-map-request-location">
        {point ? (
          <p className="cp-map-request-point">
            <strong>
              {resolvingName
                ? "กำลังระบุพื้นที่…"
                : requestPlaceTitle(point.name)}
            </strong>
            <span>
              {point.address ? (
                point.address
              ) : (
                <>
                  {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                </>
              )}
            </span>
          </p>
        ) : (
          <p>
            เลื่อนหรือซูมแผนที่ แล้วแตะจุดที่ต้องการ
            หรือค้นหาสถานที่ด้วยปุ่มแว่นขยาย
          </p>
        )}
        {editing && point && (
          <button
            className="cp-map-request-reselect cp-focus"
            type="button"
            aria-label="เปลี่ยนจุดบนแผนที่"
            onClick={onReselect}
          >
            เปลี่ยนจุด
          </button>
        )}
      </div>
      {editing && point ? (
        <>
          <CreateRequest
            key={`${point.lat}:${point.lon}`}
            place={point}
            initiallyOpen
            mapContext
            selectedRadius={radius}
            onRadiusChange={onRadiusChange}
            onCreated={onCreated}
            resolvingName={resolvingName}
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
      {!editing && (
        <Link href="/requests" className="cp-measure-link cp-focus">
          ดูคำขอของฉัน
        </Link>
      )}
    </section>
  );
}
