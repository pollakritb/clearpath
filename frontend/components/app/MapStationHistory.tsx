"use client";

import { useEffect, useState } from "react";
import HistoryChart from "@/frontend/components/panels/HistoryChart";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import { loadPublicData } from "@/frontend/lib/public-data-cache";
import type { HistoryResponse } from "@/frontend/types";

export default function MapStationHistory({
  stationId,
}: {
  stationId: string;
}) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    stationId: string;
    revision: number;
    data?: HistoryResponse;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void loadPublicData(
      `station-history:${stationId}:24`,
      60_000,
      () => api.history(stationId, 24),
      revision > 0,
    )
      .then((data) => {
        if (active) setSnapshot({ stationId, revision, data });
      })
      .catch((error) => {
        if (active)
          setSnapshot({
            stationId,
            revision,
            error: apiErrorMessage(error, "โหลดประวัติไม่สำเร็จ"),
          });
      });
    return () => {
      active = false;
    };
  }, [stationId, revision]);
  const current =
    snapshot?.stationId === stationId && snapshot.revision === revision
      ? snapshot
      : null;
  return (
    <section
      className="cp-map-station-history"
      aria-label="ค่าตรวจวัดสถานีย้อนหลัง 24 ชั่วโมง"
    >
      <div className="cp-map-station-forecast__heading">
        <span className="cp-map-station-forecast__icon" aria-hidden="true">
          <AppIcon name="activity" size={18} />
        </span>
        <div>
          <h2>ค่าตรวจวัดย้อนหลัง 24 ชั่วโมง</h2>
          <p>Air4Thai · สถานีที่เลือก</p>
        </div>
      </div>
      {current?.error ? (
        <div role="alert">
          <p>{current.error}</p>
          <button
            type="button"
            className="cp-focus"
            onClick={() => setRevision((value) => value + 1)}
          >
            ลองใหม่
          </button>
        </div>
      ) : (
        <HistoryChart points={current?.data?.points ?? []} loading={!current} />
      )}
    </section>
  );
}
