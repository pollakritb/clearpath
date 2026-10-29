"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { UNKNOWN_REQUEST_PLACE } from "@/frontend/lib/request-place";
import type {
  LocationLabelResponse,
  LocationSuggestion,
} from "@/frontend/types";

export function useRequestPlaceLabel(
  point: LocationSuggestion | null,
  active: boolean,
) {
  const [resolved, setResolved] = useState<{
    key: string;
    label: LocationLabelResponse;
  } | null>(null);
  const needsLabel = active && point?.kind === "point";
  const key = point ? `${point.lat}:${point.lon}` : "";
  const lat = point?.lat;
  const lon = point?.lon;
  useEffect(() => {
    if (!needsLabel || lat == null || lon == null) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void api
        .reverseLocation(lat, lon)
        .then((label) => {
          if (alive) setResolved({ key, label });
        })
        .catch(() => {
          if (alive)
            setResolved({
              key,
              label: {
                name: UNKNOWN_REQUEST_PLACE,
                address: "",
                source: "local",
              },
            });
        });
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, lat, lon, needsLabel]);
  const label = needsLabel && resolved?.key === key ? resolved.label : null;
  return {
    point:
      needsLabel && point
        ? ({
            ...point,
            name: label?.name ?? UNKNOWN_REQUEST_PLACE,
            address: label?.address ?? "",
            source: label?.source ?? "local",
            kind: "request-area",
          } as LocationSuggestion)
        : point,
    loading: Boolean(needsLabel && !label),
  };
}
