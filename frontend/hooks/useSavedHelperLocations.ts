"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { HELPER_LOCATIONS_CHANGED } from "@/frontend/lib/measurement-events";
import type { MeasurementHelperLocation } from "@/frontend/types";

export function useSavedHelperLocations(userId: string | null, active = true) {
  const [snapshot, setSnapshot] = useState<{
    userId: string;
    locations: MeasurementHelperLocation[];
  } | null>(null);
  useEffect(() => {
    if (!userId || !active) return;
    let alive = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const settings = await api.measurementHelper();
        if (alive && current === sequence)
          setSnapshot({
            userId,
            locations: settings.registered_locations_enabled
              ? (settings.locations ?? [])
              : [],
          });
      } catch {
        if (alive && current === sequence)
          setSnapshot({ userId, locations: [] });
      }
    };
    const changed = () => {
      void refresh();
    };
    changed();
    window.addEventListener(HELPER_LOCATIONS_CHANGED, changed);
    window.addEventListener("focus", changed);
    return () => {
      alive = false;
      window.removeEventListener(HELPER_LOCATIONS_CHANGED, changed);
      window.removeEventListener("focus", changed);
    };
  }, [userId, active]);
  return userId && snapshot?.userId === userId ? snapshot.locations : [];
}
