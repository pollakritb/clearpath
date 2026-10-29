"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapDataMode } from "@/frontend/types/ui";
/** Observation preferences remain untouched while CAMS temporarily masks their layers. */
export function useMapDataMode(initialCams = false) {
  const [state, setState] = useState<{
    mode: MapDataMode;
    previous: "current" | "history";
  }>({ mode: initialCams ? "cams" : "current", previous: "current" });
  const previousInitial = useRef(initialCams);
  useEffect(() => {
    const enter = initialCams && !previousInitial.current;
    previousInitial.current = initialCams;
    if (!enter) return;
    const frame = requestAnimationFrame(() =>
      setState((s) =>
        s.mode === "cams" ? s : { mode: "cams", previous: s.mode },
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [initialCams]);
  const setHistoryEnabled = useCallback(
    (enabled: boolean) =>
      setState({ mode: enabled ? "history" : "current", previous: "current" }),
    [],
  );
  const toggleCams = useCallback(
    () =>
      setState((s) =>
        s.mode === "cams"
          ? { mode: s.previous, previous: "current" }
          : { mode: "cams", previous: s.mode },
      ),
    [],
  );
  return {
    mode: state.mode,
    camsEnabled: state.mode === "cams",
    historyEnabled: state.mode === "history",
    setHistoryEnabled,
    toggleCams,
  };
}
