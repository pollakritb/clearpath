"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { api } from "@/frontend/lib/api-client";
import { subscribeForegroundLocation } from "@/frontend/lib/foreground-location";
import type { AlertLocationInput } from "@/frontend/types";

export const ALERT_PREFERENCES_CHANGED = "clearpath:alert-preferences";
export const ALERT_LOCATION_CHANGED = "clearpath:alert-location";
const SAVE_INTERVAL_MS = 30000;

/** Share foreground GPS with the map, retaining only the latest server sample. */
export default function AlertLocationPresence() {
  const { user, localDemo, loading } = useAuth();
  const account = user?.id ?? (localDemo ? "local" : null);
  useEffect(() => {
    if (!account || loading) return;
    let stopped = false;
    let revision = 0;
    let permission: PermissionStatus | null = null;
    let unsubscribe: (() => void) | null = null;
    let pending: AlertLocationInput | null = null;
    let lastSavedObservation: string | null = null;
    let lastFlushObservation: string | null = null;
    let lastAttempt = 0;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const persist = (keepalive = false) => {
      clearTimer();
      if (stopped || !pending || pending.observed_at === lastSavedObservation)
        return;
      if (inFlight && !keepalive) {
        timer = setTimeout(() => persist(), SAVE_INTERVAL_MS);
        return;
      }
      if (keepalive && pending.observed_at === lastFlushObservation) return;
      if (keepalive) lastFlushObservation = pending.observed_at;
      const sample = pending;
      lastAttempt = Date.now();
      inFlight = true;
      void api
        .updateAlertLocation(sample, { keepalive })
        .then(() => {
          if (stopped) return;
          if (
            !lastSavedObservation ||
            sample.observed_at > lastSavedObservation
          )
            lastSavedObservation = sample.observed_at;
          window.dispatchEvent(new Event(ALERT_LOCATION_CHANGED));
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
          if (
            !stopped &&
            document.visibilityState !== "hidden" &&
            pending &&
            pending.observed_at !== lastSavedObservation &&
            timer === null
          )
            timer = setTimeout(() => persist(), SAVE_INTERVAL_MS);
        });
    };
    const position: PositionCallback = (value) => {
      const { latitude: lat, longitude: lon, accuracy } = value.coords;
      if (
        stopped ||
        !Number.isFinite(value.timestamp) ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 200 ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      )
        return;
      const observed_at = new Date(value.timestamp).toISOString();
      if (pending && observed_at <= pending.observed_at) return;
      pending = { lat, lon, accuracy_m: accuracy, observed_at };
      const delay = Math.max(0, SAVE_INTERVAL_MS - (Date.now() - lastAttempt));
      if (!delay) persist();
      else if (timer === null) timer = setTimeout(() => persist(), delay);
    };
    const deactivate = () => {
      unsubscribe?.();
      unsubscribe = null;
      clearTimer();
      pending = null;
    };
    async function configure() {
      const cycle = ++revision;
      deactivate();
      try {
        const prefs = await api.notificationPreferences();
        if (
          stopped ||
          cycle !== revision ||
          !prefs.air_alerts ||
          !navigator.permissions ||
          !navigator.geolocation
        )
          return;
        const next = await navigator.permissions.query({ name: "geolocation" });
        if (stopped || cycle !== revision) return;
        if (permission !== next) {
          permission?.removeEventListener?.("change", changed);
          permission = next;
          permission.addEventListener?.("change", changed);
        }
        if (permission.state === "granted")
          unsubscribe = subscribeForegroundLocation({
            position,
            pause: () => persist(true),
          });
      } catch {
        /* Retry on the next foreground visit or preference change. */
      }
    }
    const changed = () => {
      void configure();
    };
    const visible = () => {
      if (document.visibilityState === "visible" && !unsubscribe)
        void configure();
    };
    void configure();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(ALERT_PREFERENCES_CHANGED, changed);
    return () => {
      stopped = true;
      revision++;
      deactivate();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(ALERT_PREFERENCES_CHANGED, changed);
      permission?.removeEventListener?.("change", changed);
    };
  }, [account, loading]);
  return null;
}
