import L from "leaflet";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ViewportController from "./ViewportController";
const map = {
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 6),
  getMaxZoom: () => 19,
  getCenter: () => ({ lat: 14, lng: 100 }),
  getSize: () => L.point(400, 800),
  project: vi.fn(() => L.point(100, 200)),
  unproject: vi.fn<(point: L.Point) => L.LatLng>(() => L.latLng(13.75, 100.5)),
};
vi.mock("react-leaflet", () => ({ useMap: () => map }));
beforeEach(() => {
  vi.clearAllMocks();
  map.getZoom.mockReturnValue(6);
});
afterEach(cleanup);
it("zooms to a selected pin and leaves it above the bottom detail card", () => {
  render(
    <ViewportController
      target={{ lat: 13.75, lon: 100.5, pin: true, token: 1 }}
    />,
  );
  expect(map.project).toHaveBeenCalledWith([13.75, 100.5], 15);
  expect(map.unproject.mock.calls[0][0].y).toBeGreaterThan(200);
  expect(map.flyTo).toHaveBeenCalledWith(L.latLng(13.75, 100.5), 15, {
    duration: 0.65,
  });
});
it("does not zoom out from a closer view and can focus the same pin again", () => {
  map.getZoom.mockReturnValue(18);
  const { rerender } = render(
    <ViewportController
      target={{ lat: 13.75, lon: 100.5, pin: true, token: 1 }}
    />,
  );
  expect(map.flyTo.mock.calls[0][1]).toBe(18);
  rerender(
    <ViewportController
      target={{ lat: 13.75, lon: 100.5, pin: true, token: 2 }}
    />,
  );
  expect(map.flyTo).toHaveBeenCalledTimes(2);
});
it("preserves the viewport when changing data mode without a new pin selection", () => {
  const target = { lat: 13.75, lon: 100.5, pin: true, token: 1 };
  const { rerender } = render(<ViewportController target={target} />);
  map.flyTo.mockClear();
  rerender(<ViewportController target={target} dataMode="history" />);
  expect(map.flyTo).not.toHaveBeenCalled();
  rerender(
    <ViewportController target={{ ...target, token: 2 }} dataMode="cams" />,
  );
  expect(map.flyTo).toHaveBeenCalledTimes(1);
});
it("keeps fitting the complete radius for requests instead of cropping their area", () => {
  render(<ViewportController target={{ lat: 14, lon: 100 }} radiusKm={3} />);
  expect(map.fitBounds).toHaveBeenCalledTimes(1);
  expect(map.flyTo).not.toHaveBeenCalled();
});
