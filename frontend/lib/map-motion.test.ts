import { afterEach, expect, it, vi } from "vitest";
import type { Map } from "leaflet";
import { flyMapTo, flyMapToBounds } from "./map-motion";

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  "uses one duration for point and bounds navigation with reduced motion %s",
  (reduce) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: reduce })),
    );
    const map = { flyTo: vi.fn(), flyToBounds: vi.fn() };
    flyMapTo(map as unknown as Map, [14, 100], 15);
    flyMapToBounds(
      map as unknown as Map,
      [
        [13, 99],
        [15, 101],
      ],
      { maxZoom: 14, padding: [48, 48] },
    );
    expect(map.flyTo).toHaveBeenCalledWith([14, 100], 15, {
      animate: !reduce,
      duration: 0.65,
    });
    expect(map.flyToBounds).toHaveBeenCalledWith(
      [
        [13, 99],
        [15, 101],
      ],
      { maxZoom: 14, padding: [48, 48], animate: !reduce, duration: 0.65 },
    );
  },
);
