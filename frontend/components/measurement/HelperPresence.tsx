"use client";
import { useEffect } from "react";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api } from "@/frontend/lib/api-client";

export const HELPER_SETTINGS_CHANGED = "clearpath:helper-settings";
export const HELPER_PRESENCE_UPDATED = "clearpath:helper-presence";

/** Opt-in only. One sample on entry/return, no background tracking or history. */
export default function HelperPresence() {
  const { user, localDemo, loading } = useAuth();
  const signedIn = Boolean(user || localDemo);
  const account = user?.id ?? (localDemo ? "local" : "guest");
  useEffect(() => {
    if (loading || !signedIn) return;
    let stopped = false;
    let lastAttempt = 0;
    const sample = async (force = false) => {
      if (
        document.visibilityState === "hidden" ||
        (!force && Date.now() - lastAttempt < 300000)
      )
        return;
      lastAttempt = Date.now();
      try {
        const settings = await api.measurementHelper();
        if (stopped || !settings.enabled || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (stopped || position.coords.accuracy > 200) return;
            void api
              .measurementPresence({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy_m: position.coords.accuracy,
                observed_at: new Date(position.timestamp).toISOString(),
              })
              .then(() => {
                if (!stopped)
                  window.dispatchEvent(new Event(HELPER_PRESENCE_UPDATED));
              })
              .catch(() => undefined);
          },
          () => undefined,
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
        );
      } catch {
        /* Settings UI explains failures; no automatic prompt when disabled. */
      }
    };
    const visible = () => {
      void sample();
    };
    const changed = () => {
      void sample(true);
    };
    void sample();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(HELPER_SETTINGS_CHANGED, changed);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(HELPER_SETTINGS_CHANGED, changed);
    };
  }, [account, signedIn, loading]);
  return null;
}
