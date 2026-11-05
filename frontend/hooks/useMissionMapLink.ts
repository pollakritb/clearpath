"use client";
import { useEffect, useRef } from "react";
import type { LocationSuggestion } from "@/frontend/types";

/** Public mission centres are navigation hints; rewards use server-side missions. */
export function useMissionMapLink(
  link: string | null | undefined,
  active: boolean,
  select: (place: LocationSuggestion) => void,
) {
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      opened.current = null;
      return;
    }
    if (!link || opened.current === link) return;
    const [id, latitude, longitude] = link.split("|");
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !id ||
      !latitude ||
      !longitude ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < 5 ||
      lat > 21 ||
      lon < 97 ||
      lon > 106
    )
      return;
    const frame = requestAnimationFrame(() => {
      opened.current = link;
      select({
        id: `mission:${id}`,
        name: "พื้นที่ภารกิจ",
        address: "บริเวณจุดศูนย์กลางภารกิจ · รัศมี 2 กม.",
        kind: "place",
        source: "local",
        lat,
        lon,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [link, active, select]);
}
