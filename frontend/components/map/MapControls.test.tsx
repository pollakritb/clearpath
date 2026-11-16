import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MapControls from "./MapControls";
const mocks = vi.hoisted(() => ({
  map: { getZoom: () => 6 },
  fly: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("react-leaflet", () => ({
  useMap: () => mocks.map,
  useMapEvents: () => {},
}));
vi.mock("@/frontend/lib/map-motion", () => ({ flyMapTo: mocks.fly }));
vi.mock("@/frontend/lib/foreground-location", () => ({
  publishForegroundPosition: mocks.publish,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("recenters the displayed location immediately and again on repeated presses", () => {
  const locate = vi.fn(),
    gps = vi.fn();
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: gps } });
  render(
    <MapControls
      currentLocation={{ lat: 13.75, lon: 100.2, accuracy: 10 }}
      onLocate={locate}
    />,
  );
  const button = screen.getByRole("button", { name: "ตำแหน่งของฉัน" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(gps).not.toHaveBeenCalled();
  expect(locate).toHaveBeenCalledTimes(2);
  expect(locate).toHaveBeenLastCalledWith(13.75, 100.2, 10);
  expect(mocks.fly).toHaveBeenLastCalledWith(mocks.map, [13.75, 100.2], 15);
});
it("requests GPS when there is no position and lets the parent own the camera", () => {
  let success!: PositionCallback;
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn((callback) => {
        success = callback;
      }),
    },
  });
  const locate = vi.fn();
  render(<MapControls onLocate={locate} manageLocateViewport={false} />);
  fireEvent.click(screen.getByRole("button", { name: "ตำแหน่งของฉัน" }));
  expect(
    screen
      .getByRole("button", { name: "กำลังหาตำแหน่ง" })
      .hasAttribute("disabled"),
  ).toBe(true);
  const position = {
    coords: { latitude: 13.75, longitude: 100.2, accuracy: 10 },
    timestamp: Date.now(),
  } as GeolocationPosition;
  act(() => success(position));
  expect(mocks.publish).toHaveBeenCalledWith(position);
  expect(locate).toHaveBeenCalledWith(13.75, 100.2, 10);
  expect(mocks.fly).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "ตำแหน่งของฉัน" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
it("reports denied permission and allows another attempt", () => {
  const gps = vi.fn((_success, error) =>
    error({ code: 1, PERMISSION_DENIED: 1 }),
  );
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: gps } });
  render(<MapControls />);
  fireEvent.click(screen.getByRole("button", { name: "ตำแหน่งของฉัน" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "อนุญาตการเข้าถึงตำแหน่ง",
  );
  fireEvent.click(screen.getByRole("button", { name: "ตำแหน่งของฉัน" }));
  expect(gps).toHaveBeenCalledTimes(2);
});
