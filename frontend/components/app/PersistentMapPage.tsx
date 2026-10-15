"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import MapPageClient from "@/frontend/components/pages/MapPageClient";

/** Keep Leaflet and the map's selection alive while navigating between tabs. */
export default function PersistentMapPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMapPage = pathname === "/";
  const [hasVisitedMap, setHasVisitedMap] = useState(isMapPage);

  useEffect(() => {
    if (!isMapPage || hasVisitedMap) return;
    const frame = window.requestAnimationFrame(() => setHasVisitedMap(true));
    return () => window.cancelAnimationFrame(frame);
  }, [hasVisitedMap, isMapPage]);

  if (!hasVisitedMap) return null;

  return (
    <div hidden={!isMapPage} aria-hidden={!isMapPage}>
      <MapPageClient
        showFiresInitially={searchParams.get("layer") === "fires"}
      />
    </div>
  );
}
