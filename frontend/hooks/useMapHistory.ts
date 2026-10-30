"use client";

import { useCallback, useRef, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type {
  CommunityReport,
  CommunityReportStack,
  Station,
} from "@/frontend/types";

export function useMapHistory() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [stacks, setStacks] = useState<CommunityReportStack[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [targetAt, setTargetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (at: Date) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.mapHistory(at.toISOString());
      if (sequence !== requestSequence.current) return;
      setStations(response.stations);
      setReports(response.reports ?? []);
      setStacks(response.stacks ?? []);
      setTargetAt(response.target_at);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setStations([]);
      setReports([]);
      setStacks([]);
      setTargetAt(at.toISOString());
      setError(apiErrorMessage(error, "โหลดค่าฝุ่นย้อนหลังไม่สำเร็จ"));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    requestSequence.current += 1;
    setStations([]);
    setReports([]);
    setStacks([]);
    setTargetAt(null);
    setError(null);
    setLoading(false);
  }, []);

  return { reports, stacks, stations, targetAt, loading, error, load, clear };
}
