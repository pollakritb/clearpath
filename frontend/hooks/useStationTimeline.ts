"use client";
import { useState, useEffect, useCallback } from "react";
import { gridValue, nearestTime } from "@/frontend/lib/forecast-grid";
import type {
  StationTime,
  StationTimeMode,
} from "@/frontend/lib/station-timeline";
import type { useMapPage } from "./useMapPage";

/** One station timeline coordinates observation history and stored CAMS time. */
export function useStationTimeline({
  cams,
  mapHistory,
  pm25,
  pauseCams,
  selectedStation,
  selectStation,
  setDataMode,
  setHistoryOffsetHours,
  setHistoryAnchor,
  setSelectedStation,
  setSelectedReport,
  setSelectedPlace,
  setSelectedStackId,
}: Pick<
  ReturnType<typeof useMapPage>,
  | "cams"
  | "mapHistory"
  | "pm25"
  | "pauseCams"
  | "selectedStation"
  | "selectStation"
  | "setDataMode"
  | "setHistoryOffsetHours"
  | "setHistoryAnchor"
  | "setSelectedStation"
  | "setSelectedReport"
  | "setSelectedPlace"
  | "setSelectedStackId"
>) {
  const [historyStation, setHistoryStation] = useState<{
    id: string;
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineMode, setTimelineMode] = useState<StationTimeMode>("history");
  const [timelineAnchor, setTimelineAnchor] = useState(
    () => Math.floor(Date.now() / 3600000) * 3600000,
  );
  const [timelineTime, setTimelineTime] = useState<StationTime>({
    kind: "current",
  });
  const selectStationTime = useCallback(
    (next: StationTime) => {
      setTimelineTime(next);
      if (next.kind === "history") setHistoryOffsetHours(next.hours);
      setDataMode(
        next.kind === "forecast"
          ? "cams"
          : next.kind === "history"
            ? "history"
            : "current",
      );
    },
    [setHistoryOffsetHours, setDataMode],
  );
  const {
    times: camsTimes,
    requestedAt: camsRequestedAt,
    select: selectCamsTime,
  } = cams;
  useEffect(() => {
    if (!timelineOpen || timelineTime.kind !== "forecast" || !camsTimes.length)
      return;
    const at = nearestTime(camsTimes, timelineTime.at);
    const frame = requestAnimationFrame(() => {
      if (at && at !== timelineTime.at)
        setTimelineTime({ kind: "forecast", at });
      else if (camsRequestedAt !== timelineTime.at)
        selectCamsTime(timelineTime.at);
    });
    return () => cancelAnimationFrame(frame);
  }, [timelineOpen, timelineTime, camsTimes, camsRequestedAt, selectCamsTime]);
  const forecastTimeError =
    cams.error ??
    (cams.noFrame || cams.unavailable
      ? "ไม่มีข้อมูลพยากรณ์ในเวลาที่เลือก"
      : null);
  const timelineLoading =
    timelineTime.kind === "history"
      ? mapHistory.loading
      : timelineTime.kind === "forecast"
        ? !forecastTimeError &&
          (cams.loading ||
            !!cams.pendingAt ||
            cams.surface?.validAt !== timelineTime.at)
        : pm25.loading;
  const timelineError =
    timelineTime.kind === "history"
      ? mapHistory.error
      : timelineTime.kind === "forecast"
        ? forecastTimeError
        : pm25.error;
  const timelineReading =
    historyStation && timelineTime.kind !== "forecast"
      ? (timelineTime.kind === "history"
          ? mapHistory.stations
          : pm25.stations
        ).find((row) => row.id === historyStation.id)
      : null;
  const timelineStation = historyStation
    ? {
        ...historyStation,
        recorded_at: timelineReading?.recorded_at,
        data_status: timelineReading?.data_status,
        pm25:
          timelineTime.kind === "forecast"
            ? cams.surface?.validAt === timelineTime.at
              ? gridValue(cams.surface, historyStation.lat, historyStation.lon)
              : null
            : (timelineReading?.pm25 ?? null),
      }
    : null;
  const closeStationTime = () => {
    setTimelineOpen(false);
    setHistoryStation(null);
    setTimelineTime({ kind: "current" });
    setDataMode("current");
    pauseCams();
  };

  const backToStation = () => {
    const station = pm25.stations.find((row) => row.id === historyStation?.id);
    closeStationTime();
    if (station) selectStation(station);
  };

  const openStationTime = (nextMode: StationTimeMode) => {
    setHistoryStation(
      selectedStation
        ? {
            id: selectedStation.id,
            name:
              selectedStation.name_th ??
              selectedStation.name_en ??
              selectedStation.id,
            lat: selectedStation.lat,
            lon: selectedStation.lon,
          }
        : null,
    );
    const anchor = Math.floor(Date.now() / 3600000) * 3600000;
    setTimelineAnchor(anchor);
    setHistoryAnchor(anchor);
    setTimelineMode(nextMode);
    setTimelineOpen(true);
    selectStationTime(
      nextMode === "history"
        ? { kind: "current" }
        : { kind: "forecast", at: new Date(anchor).toISOString() },
    );
    setSelectedStation(null);
    setSelectedReport(null);
    setSelectedPlace(null);
    setSelectedStackId(null);
  };

  return {
    historyStation,
    setHistoryStation,
    timelineOpen,
    setTimelineOpen,
    timelineMode,
    timelineAnchor,
    timelineTime,
    selectStationTime,
    timelineLoading,
    timelineError,
    timelineStation,
    closeStationTime,
    backToStation,
    openStationTime,
  };
}
