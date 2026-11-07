"use client";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";
import type { ReactNode } from "react";
/** Keep detail sheets outside Leaflet's transformed map panes. */
export default function MapSheetPortal({ children }: { children: ReactNode }) {
  const map = useMap();
  const host = map.getContainer().closest(".cp-map");
  return host ? createPortal(children, host) : null;
}
