"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  CommunityReport,
  MeasurementRequestView,
  Station,
} from "@/frontend/types";

type Links = {
  initialRequestId?: string | null;
  initialReportId?: string | null;
  initialReportRequestId?: string | null;
  initialStationId?: string | null;
};

/** A single link owns selection; request > report > station, including while loading. */
export function useMapLinks({
  active,
  userId,
  links,
  reports,
  requests,
  stations,
  stationsLoading,
  onReport,
  onRequest,
  onStation,
}: {
  active: boolean;
  userId: string | null;
  links: Links;
  reports: CommunityReport[];
  requests: MeasurementRequestView[];
  stations: Station[];
  stationsLoading: boolean;
  onReport: (report: CommunityReport) => void;
  onRequest: (request: MeasurementRequestView) => void;
  onStation: (station: Station) => void;
}) {
  const {
    initialRequestId,
    initialReportId,
    initialReportRequestId,
    initialStationId,
  } = links;
  const opened = useRef<string | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const key = active
    ? JSON.stringify([
        userId,
        initialRequestId || initialReportId || initialStationId,
        initialRequestId ? "request" : initialReportId ? "report" : "station",
        initialReportRequestId,
      ])
    : "";
  useEffect(() => {
    if (!active || !(initialRequestId || initialReportId || initialStationId)) {
      opened.current = null;
      return;
    }
    if (opened.current === key) return;
    let cancelled = false;
    const open = async () => {
      if (initialRequestId) {
        const row = requests.find((r) => r.id === initialRequestId);
        if (!row || row.status === "cancelled") return;
        onRequest(row);
      } else if (initialReportId) {
        const row =
          reports.find((r) => r.id === initialReportId) ??
          (await api.reportDetail(initialReportId, initialReportRequestId));
        if (cancelled) return;
        onReport(row);
      } else {
        const row = stations.find((s) => s.id === initialStationId);
        if (!row) {
          if (!stationsLoading)
            setFailure({ key, message: "ไม่พบสถานีจากลิงก์นี้" });
          return;
        }
        onStation(row);
      }
      opened.current = key;
      setFailure(null);
    };
    const run = () => {
      void open().catch((error: unknown) => {
        if (!cancelled)
          setFailure({
            key,
            message: apiErrorMessage(
              error,
              "เปิดข้อมูลจากลิงก์ไม่สำเร็จ กรุณาลองใหม่",
            ),
          });
      });
    };
    const frame =
      initialReportId && !initialRequestId
        ? (run(), null)
        : requestAnimationFrame(run);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [
    active,
    key,
    initialRequestId,
    initialReportId,
    initialReportRequestId,
    initialStationId,
    reports,
    requests,
    stations,
    stationsLoading,
    onReport,
    onRequest,
    onStation,
  ]);
  return failure?.key === key ? failure.message : null;
}
