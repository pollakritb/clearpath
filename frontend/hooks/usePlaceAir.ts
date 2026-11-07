"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { assessPlaceAir } from "@/frontend/lib/place-air";
import type { CommunityReport, Station } from "@/frontend/types";

/** Fail closed for community contributors until private author selection succeeds. */
export function usePlaceAir(
  place: { lat: number; lon: number } | null,
  stations: Station[],
  reports: CommunityReport[],
  at: number,
) {
  const lat = place?.lat,
    lon = place?.lon;
  const key = place
    ? `${place.lat}:${place.lon}:${at}:${reports.map((r) => `${r.id}:${r.captured_at}:${r.pm25}:${r.lat}:${r.lon}`).join("|")}`
    : "";
  const nearby = useMemo(
    () =>
      lat != null && lon != null
        ? assessPlaceAir(lat, lon, [], reports, new Date(at))
        : null,
    [lat, lon, reports, at],
  );
  const needsSelection = nearby?.reports.some((item) => item.usable) ?? false;
  const [selection, setSelection] = useState<{
    key: string;
    ids: string[];
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (lat == null || lon == null || !needsSelection) return;
    let cancelled = false;
    api
      .placeReportSelection(lat, lon, new Date(at).toISOString())
      .then((result) => {
        if (!cancelled)
          setSelection({ key, ids: result.report_ids, error: false });
      })
      .catch(() => {
        if (!cancelled) setSelection({ key, ids: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, key, at, needsSelection]);
  return useMemo(() => {
    if (!place) return null;
    const settled = selection?.key === key;
    const air = assessPlaceAir(
      place.lat,
      place.lon,
      stations,
      reports,
      new Date(at),
      new Set(settled ? selection.ids : []),
    );
    if (needsSelection && (!settled || selection.error)) {
      for (const item of air.reports)
        if (item.exclusion === "older")
          item.exclusion = "selection_unavailable";
    }
    return {
      ...air,
      selectionPending: needsSelection && !settled,
      selectionError: needsSelection && settled && selection.error,
    };
  }, [place, stations, reports, at, selection, key, needsSelection]);
}
