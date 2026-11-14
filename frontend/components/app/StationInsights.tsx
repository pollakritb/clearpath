"use client";

import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import HistoryTimeline from "./HistoryTimeline";
import type { HistoryPoint, Station } from "@/frontend/types";
import styles from "./StationInsights.module.css";

export default function StationInsights({
  station,
  enabled,
  historicalAt,
}: {
  station: Station;
  enabled: boolean;
  historicalAt?: string | null;
}) {
  const [retry, setRetry] = useState(0);
  const requestKey = `${station.id}:${historicalAt ?? "live"}:${enabled}:${retry}`;
  const [state, setState] = useState<{
    points: HistoryPoint[];
    status: "loading" | "ready" | "error";
    reference: number;
    key: string;
  }>({ points: [], status: "loading", reference: 0, key: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const reference = historicalAt ? Date.parse(historicalAt) : Date.now();
    void api
      .history(
        station.id,
        24,
        new Date(reference).toISOString(),
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({
            points: result.points,
            status: "ready",
            reference,
            key: requestKey,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ points: [], status: "error", reference, key: requestKey });
      });
    return () => controller.abort();
  }, [station.id, enabled, historicalAt, requestKey]);
  return (
    <div className={styles.root}>
      <HistoryTimeline
        key={state.reference}
        points={state.points}
        reference={state.reference}
        status={state.key === requestKey ? state.status : "loading"}
        onRetry={() => setRetry((n) => n + 1)}
      />

      <p className={styles.section}>
        {station.province ?? "ประเทศไทย"} · รหัสสถานี {station.id}
      </p>
    </div>
  );
}
