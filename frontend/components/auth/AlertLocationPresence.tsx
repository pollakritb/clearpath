"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { api } from "@/frontend/lib/api-client";

export const ALERT_PREFERENCES_CHANGED = "clearpath:alert-preferences";
export const ALERT_LOCATION_CHANGED = "clearpath:alert-location";

/** Foreground samples only. Never triggers an automatic permission prompt. */
export default function AlertLocationPresence() {
  const { user, localDemo, loading } = useAuth();
  const account = user?.id ?? (localDemo ? "local" : null);
  useEffect(() => {
    if (!account || loading) return;
    let stopped = false;
    let lastAttempt = 0;
    async function sample() {
      if (
        document.visibilityState === "hidden" ||
        Date.now() - lastAttempt < 300_000
      )
        return;
      lastAttempt = Date.now();
      try {
        const prefs = await api.notificationPreferences();
        if (
          stopped ||
          !prefs.consent_granted ||
          !prefs.air_alerts ||
          !navigator.geolocation ||
          !navigator.permissions
        )
          return;
        const permission = await navigator.permissions.query({
          name: "geolocation",
        });
        if (stopped || permission.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (stopped || position.coords.accuracy > 200) return;
            void api
              .updateAlertLocation({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy_m: position.coords.accuracy,
                observed_at: new Date(position.timestamp).toISOString(),
              })
              .then(() => {
                if (!stopped)
                  window.dispatchEvent(new Event(ALERT_LOCATION_CHANGED));
              })
              .catch(() => undefined);
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
        );
      } catch {
        /* Explicit controls explain failure; do not claim a saved point. */
      }
    }
    const changed = () => {
      lastAttempt = 0;
      void sample();
    };
    const visible = () => {
      void sample();
    };
    void sample();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(ALERT_PREFERENCES_CHANGED, changed);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(ALERT_PREFERENCES_CHANGED, changed);
    };
  }, [account, loading]);
  return null;
}
