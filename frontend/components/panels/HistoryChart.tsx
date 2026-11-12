"use client";
import { useState } from "react";
import HistoryTimeline from "@/frontend/components/app/HistoryTimeline";
import type { HistoryPoint } from "@/frontend/types";
import styles from "@/frontend/components/app/StationInsights.module.css";

export default function HistoryChart({
  points,
  loading,
  reference,
  error,
  onRetry,
}: {
  points: HistoryPoint[];
  loading: boolean;
  reference?: number | null;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [mountedAt] = useState(() => Date.now());
  return (
    <div className={styles.root}>
      <HistoryTimeline
        key={reference ?? mountedAt}
        points={points}
        reference={reference ?? mountedAt}
        status={loading ? "loading" : error ? "error" : "ready"}
        onRetry={onRetry}
      />
    </div>
  );
}
