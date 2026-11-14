"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/lib/api-client";
import { coordinatePlaceTitle } from "@/frontend/lib/request-place";
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
  const pickedPoint = point?.kind === "point";
  const needsLabel = Boolean(
    active &&
    point &&
    (pickedPoint ||
      !point.address ||
      /(^|[,·])\s*(บ้าน|หมู่บ้าน)/.test(point.address)),
  );
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
                name: coordinatePlaceTitle(lat, lon),
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
            name: pickedPoint
              ? (label?.name ?? coordinatePlaceTitle(point.lat, point.lon))
              : point.name,
            address: pickedPoint
              ? (label?.address ?? "")
              : label
                ? label.address || (label.source === "local" ? label.name : "")
                : point.address,
            source: label?.source ?? point.source,
            kind: pickedPoint ? "request-area" : point.kind,
          } as LocationSuggestion)
        : point,
    loading: Boolean(needsLabel && !label),
  };
}
