"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import L from "leaflet";
import { Marker, useMap } from "react-leaflet";

const Priority = createContext<{
  active: string | null;
  select: (id: string, marker: L.Marker) => void;
} | null>(null);

/** One shared selection order, independent of marker type or screen latitude. */
export function MarkerPriorityProvider({ children }: { children: ReactNode }) {
  const map = useMap();
  const [active, setActive] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      active,
      select(id: string, marker: L.Marker) {
        map.eachLayer((layer) => {
          if (layer instanceof L.Marker && layer !== marker) layer.closePopup();
        });
        setActive(id);
      },
    }),
    [active, map],
  );
  return <Priority.Provider value={value}>{children}</Priority.Provider>;
}

export default function PriorityMarker({
  priorityId,
  eventHandlers,
  zIndexOffset = 0,
  ...props
}: ComponentProps<typeof Marker> & { priorityId: string }) {
  const priority = useContext(Priority);
  return (
    <Marker
      {...props}
      zIndexOffset={priority?.active === priorityId ? 100000 : zIndexOffset}
      eventHandlers={{
        ...eventHandlers,
        click(event) {
          priority?.select(priorityId, event.target);
          eventHandlers?.click?.(event);
        },
      }}
    />
  );
}
