import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCurrentLocation } from "./useCurrentLocation";

describe("useCurrentLocation", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("reports unsupported browsers without throwing", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useCurrentLocation(false));

    act(() => result.current.request());
    expect(result.current.status).toBe("unavailable");
    expect(result.current.location).toBeNull();
  });

  it("stores successful coordinates and accuracy", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: { latitude: 13.8, longitude: 100.1, accuracy: 25 },
          } as GeolocationPosition),
        ),
      },
    });
    const { result } = renderHook(() => useCurrentLocation(false));

    act(() => result.current.request());
    expect(result.current.status).toBe("ready");
    expect(result.current.location).toEqual({
      lat: 13.8,
      lon: 100.1,
      accuracy: 25,
    });
  });

  it("distinguishes denied permission from other location failures", () => {
    let failure: PositionErrorCallback | undefined;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(
          (_success: PositionCallback, error: PositionErrorCallback) => {
            failure = error;
          },
        ),
      },
    });
    const { result } = renderHook(() => useCurrentLocation(false));

    act(() => result.current.request());
    act(() =>
      failure?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    expect(result.current.status).toBe("denied");

    act(() => result.current.request());
    act(() =>
      failure?.({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    expect(result.current.status).toBe("unavailable");
  });

  it("requests location automatically only when enabled and idle", () => {
    vi.useFakeTimers();
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderHook(() => useCurrentLocation(true));
    act(() => vi.runOnlyPendingTimers());
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });
});
