"use client";

import { useCallback, useState } from "react";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import ReportForm from "@/frontend/components/panels/ReportForm";
import type { ReportLocation } from "@/frontend/types/ui";

export default function ReportPageClient() {
  const [location, setLocation] = useState<ReportLocation | null>(null);

  const requestLocation = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: "gps",
        accuracy: position.coords.accuracy,
      });
    });
  }, []);

  return (
    <UserPageShell
      tab="report"
      icon="camera"
      header={{ showDataStatus: false }}
    >
      <ReportForm
        location={location}
        onRequestLocation={requestLocation}
        onSubmitted={() => undefined}
      />
    </UserPageShell>
  );
}
