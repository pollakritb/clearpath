"use client";
import { useEffect, useState } from "react";
import MapBottomSheet from "./MapBottomSheet";
import MapPanelReading from "./MapPanelReading";
import { useMapHistory } from "@/frontend/hooks/useMapHistory";
import type { PlaceAir } from "@/frontend/lib/place-air";
import { usePlaceAir } from "@/frontend/hooks/usePlaceAir";
import type { LocationSuggestion } from "@/frontend/types";
import AppIcon from "@/frontend/components/ui/AppIcon";
import styles from "./MapPanel.module.css";
export default function PlaceHistoryPanel({
  place,
  current,
  onBack,
  onClose,
}: {
  place: LocationSuggestion;
  current: PlaceAir;
  onBack: () => void;
  onClose: () => void;
}) {
  const [anchor] = useState(() => Date.now()),
    [hours, setHours] = useState(0);
  const history = useMapHistory();
  const { load, clear } = history;
  useEffect(() => {
    if (hours) void load(new Date(anchor - hours * 3600000));
    else clear();
  }, [hours, anchor, load, clear]);
  const at = hours ? new Date(anchor - hours * 3600000) : new Date(anchor);
  const historicalAir = usePlaceAir(
    hours ? place : null,
    history.stations,
    history.reports,
    history.targetAt ? Date.parse(history.targetAt) : anchor - hours * 3600000,
  );
  const air = hours ? historicalAir! : current;
  const unavailable =
    history.loading ||
    !!history.error ||
    historicalAir?.selectionPending ||
    historicalAir?.selectionError;
  const format = (value: Date) =>
    value.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <MapBottomSheet
      label="ค่าฝุ่นย้อนหลังของสถานที่"
      className={styles.panel}
      initialSnap="full"
      onClose={onClose}
      header={
        <>
          <button
            type="button"
            className={`${styles.action} cp-focus`}
            onClick={onBack}
          >
            <AppIcon name="back" size={17} /> กลับไปที่สถานที่
          </button>
          <h1 className={styles.title}>{place.name}</h1>
          <p className={styles.context}>ค่าตรวจวัดย้อนหลัง · ภายใน 2 กม.</p>
          <MapPanelReading
            value={
              unavailable
                ? null
                : air.value == null
                  ? null
                  : Number(air.value.toFixed(1))
            }
            status={
              history.loading
                ? "กำลังโหลดข้อมูล…"
                : history.error
                  ? "โหลดข้อมูลไม่สำเร็จ"
                  : undefined
            }
            caption={hours ? format(at) : "ตอนนี้"}
          />
        </>
      }
    >
      {historicalAir?.selectionError && (
        <p role="alert">ตรวจข้อมูลผู้รายงานไม่สำเร็จ กรุณาเลือกเวลาอีกครั้ง</p>
      )}
      <label className={styles.historyLabel} htmlFor="place-history-hours">
        {hours ? `ย้อนหลัง ${hours} ชั่วโมง` : "ตอนนี้"}
      </label>
      <input
        id="place-history-hours"
        className={styles.historyRange}
        type="range"
        min={0}
        max={24}
        value={24 - hours}
        aria-label="เลือกชั่วโมงย้อนหลังของสถานที่"
        aria-valuetext={hours ? `ย้อนหลัง ${hours} ชั่วโมง` : "ตอนนี้"}
        onChange={(event) => setHours(24 - Number(event.target.value))}
      />
      <div className={styles.rangeEnds}>
        <span>24 ชั่วโมงก่อน</span>
        <button
          type="button"
          className={`${styles.action} cp-focus`}
          onClick={() => setHours(0)}
        >
          ตอนนี้
        </button>
      </div>
      {history.error ? (
        <p role="alert">
          {history.error}{" "}
          <button
            type="button"
            className={`${styles.action} cp-focus`}
            onClick={() => void load(at)}
          >
            ลองใหม่
          </button>
        </p>
      ) : (
        <p className={styles.address}>
          {air.contributors.length
            ? `ใช้ข้อมูล ${air.contributors.filter((point) => point.source === "station").length} สถานี · ผู้รายงาน ${air.contributors.filter((point) => point.source === "report").length} คน`
            : `ไม่มีข้อมูลที่ใช้ประเมินได้ในวง 2 กม. ${hours ? "ณ เวลาที่เลือก" : "ตอนนี้"}`}
        </p>
      )}
      <p className={styles.address}>
        ค่าประเมินจากสถานีและรายงาน ณ เวลาที่เลือก ไม่ใช่ค่าพยากรณ์ ·
        ใช้รายงานล่าสุดที่ผ่านเกณฑ์ต่อคน
      </p>
    </MapBottomSheet>
  );
}
