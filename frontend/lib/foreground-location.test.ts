import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  publishForegroundPosition,
  subscribeForegroundLocation,
} from "./foreground-location";
let callbacks: PositionCallback[];
let stops: (() => void)[];
const watch = vi.fn();
const clear = vi.fn();
const point = (lat: number) =>
  ({
    coords: { latitude: lat, longitude: 100, accuracy: 10 },
    timestamp: Date.now(),
  }) as GeolocationPosition;
function visibility(value: string) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  callbacks = [];
  stops = [];
  watch.mockReset();
  clear.mockReset();
  watch.mockImplementation((success: PositionCallback) => {
    callbacks.push(success);
    return callbacks.length;
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: watch, clearWatch: clear },
  });
  visibility("visible");
});
afterEach(() => {
  stops.forEach((stop) => stop());
});
it("shares one watch and the same moving position across map and alerts", () => {
  const map = vi.fn();
  const alert = vi.fn();
  stops.push(subscribeForegroundLocation({ position: map }));
  stops.push(subscribeForegroundLocation({ position: alert }));
  expect(watch).toHaveBeenCalledOnce();
  callbacks[0](point(14));
  callbacks[0](point(14.1));
  expect(map.mock.calls.at(-1)?.[0].coords.latitude).toBe(14.1);
  expect(alert.mock.calls.at(-1)?.[0].coords.latitude).toBe(14.1);
  stops.shift()?.();
  expect(clear).not.toHaveBeenCalled();
});
it("flushes before suspension, ignores late callbacks and restarts on visibility", () => {
  const position = vi.fn();
  const pause = vi.fn();
  stops.push(subscribeForegroundLocation({ position, pause }));
  visibility("hidden");
  expect(pause).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledWith(1);
  callbacks[0](point(14));
  expect(position).not.toHaveBeenCalled();
  visibility("visible");
  expect(watch).toHaveBeenCalledTimes(2);
  callbacks[1](point(14.1));
  expect(position).toHaveBeenCalledOnce();
});
it("publishes a manual recenter sample to every foreground subscriber", () => {
  const position = vi.fn();
  stops.push(subscribeForegroundLocation({ position }));
  publishForegroundPosition(point(14.2));
  expect(position.mock.calls[0][0].coords.latitude).toBe(14.2);
});

it("gives a late alert subscriber the fresh point already read by the map", () => {
  stops.push(subscribeForegroundLocation({ position: vi.fn() }));
  callbacks[0](point(14));
  const alert = vi.fn();
  stops.push(subscribeForegroundLocation({ position: alert }));
  expect(alert).toHaveBeenCalledOnce();
  expect(alert.mock.calls[0][0].coords.latitude).toBe(14);
  expect(watch).toHaveBeenCalledOnce();
});
