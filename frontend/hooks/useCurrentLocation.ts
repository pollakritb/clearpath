"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  publishForegroundPosition,
  subscribeForegroundLocation,
} from "@/frontend/lib/foreground-location";

export type CurrentLocationStatus =
  "idle" | "locating" | "ready" | "denied" | "unavailable";

export interface CurrentLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export function useCurrentLocation(enabled: boolean, follow = false) {
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [status, setStatus] = useState<CurrentLocationStatus>("idle");

  const request = useCallback(() => {
    const sequence = ++requestSequence.current;
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (sequence !== requestSequence.current) return;
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus("ready");
        publishForegroundPosition(position);
      },
      (error) => {
        if (sequence !== requestSequence.current) return;
        setLocation(null);
        setStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 0,
      },
    );
  }, []);

  useEffect(() => {
    if (!enabled || !follow) return;
    return subscribeForegroundLocation({
      position: (position) => {
        requestSequence.current += 1;
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus("ready");
      },
      error: (error) => {
        requestSequence.current += 1;
        setLocation(null);
        setStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
    });
  }, [enabled, follow]);

  useEffect(() => {
    if (!enabled || status !== "idle" || (follow && navigator.geolocation))
      return;
    const timer = window.setTimeout(request, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, follow, request, status]);

  return { location, status, request };
}
