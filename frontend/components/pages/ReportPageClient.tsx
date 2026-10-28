"use client";

import { useCallback, useState } from "react";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import ReportForm from "@/frontend/components/panels/ReportForm";
import type { ReportLocation } from "@/frontend/types/ui";

export default function ReportPageClient() {
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    setLocation(null);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError(
        "อุปกรณ์นี้ไม่รองรับ GPS กรุณาใช้อุปกรณ์ที่รองรับตำแหน่ง",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          source: "gps",
          accuracy: position.coords.accuracy,
        });
        if (position.coords.accuracy > 200)
          setLocationError(
            "GPS คลาดเคลื่อนเกิน 200 เมตร กรุณาลองรับตำแหน่งใหม่ในบริเวณที่สัญญาณชัดเจน",
          );
      },
      (error) => {
        setLocationError(
          error.code === 1
            ? "กรุณาอนุญาตตำแหน่งให้ ClearPath ในการตั้งค่าเบราว์เซอร์ แล้วลองอีกครั้ง"
            : "รับตำแหน่ง GPS ไม่สำเร็จ กรุณาลองอีกครั้งในบริเวณที่สัญญาณชัดเจน",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }, []);

  return (
    <UserPageShell
      tab="report"
      icon="camera"
      header={{ showDataStatus: false }}
    >
      <ReportForm
        location={location}
        locationError={locationError}
        onRequestLocation={requestLocation}
        onSubmitted={() => undefined}
      />
    </UserPageShell>
  );
}
