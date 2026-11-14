"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
        maximumAge: 5 * 60_000,
      },
    );
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      !follow ||
      typeof navigator.geolocation?.watchPosition !== "function"
    )
      return;
    let active = true;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        requestSequence.current += 1;
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus("ready");
      },
      (error) => {
        if (!active) return;
        requestSequence.current += 1;
        setLocation(null);
        setStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled, follow]);

  useEffect(() => {
    if (
      !enabled ||
      status !== "idle" ||
      (follow && typeof navigator.geolocation?.watchPosition === "function")
    )
      return;
    const timer = window.setTimeout(request, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, follow, request, status]);

  return { location, status, request };
}
