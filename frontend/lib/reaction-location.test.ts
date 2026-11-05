import { afterEach, expect, it, vi } from "vitest";
import { requestReactionLocation } from "./reaction-location";

afterEach(() => vi.unstubAllGlobals());

it("requests an uncached fix and preserves the accuracy and acquisition timestamp", async () => {
  const getCurrentPosition = vi.fn(
    (
      success: PositionCallback,
      _error: PositionErrorCallback | null,
      _options: PositionOptions,
    ) => {
      void _error;
      void _options;
      success({
        coords: { latitude: 14, longitude: 100, accuracy: 36 },
        timestamp: 1793870000000,
      } as GeolocationPosition);
    },
  );
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  const fix = await requestReactionLocation();
  expect(fix).toEqual({
    lat: 14,
    lon: 100,
    accuracy_m: 36,
    observed_at: new Date(1793870000000).toISOString(),
  });
  expect(getCurrentPosition.mock.calls[0][2]).toEqual({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });
});

it("handles denied permission without creating a fabricated location", async () => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (
        _success: unknown,
        error: (err: { code: number }) => void,
      ) => error({ code: 1 }),
    },
  });
  await expect(requestReactionLocation()).rejects.toThrow("อนุญาตตำแหน่ง");
});
