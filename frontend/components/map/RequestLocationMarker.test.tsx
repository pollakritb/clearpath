import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RequestLocationMarker from "./RequestLocationMarker";

const state = vi.hoisted(() => ({
  center: { lat: 14, lng: 100 },
  zoom: 11,
  handlers: {} as { moveend?: () => void },
  marker: null as null | { draggable: boolean; position: number[] },
  setView: vi.fn(),
}));
vi.mock("react-leaflet", () => ({
  useMap: () => map,
  useMapEvents: (handlers: typeof state.handlers) => {
    state.handlers = handlers;
  },
  Circle: () => null,
  Marker: (props: NonNullable<typeof state.marker>) => {
    state.marker = props;
    return null;
  },
}));
const map = {
  getCenter: () => state.center,
  getZoom: () => state.zoom,
  getContainer: () => document.body,
  setView: state.setView,
};
beforeEach(() => {
  state.center = { lat: 14, lng: 100 };
  state.zoom = 11;
  state.setView.mockReset().mockImplementation((point, zoom) => {
    state.center = point;
    state.zoom = zoom;
  });
});
afterEach(cleanup);
it("selects the map center, follows map panning, and never recenters on its own emitted coordinates", () => {
  const move = vi.fn();
  const { rerender } = render(
    <RequestLocationMarker position={null} onMove={move} />,
  );
  expect(
    screen.getByRole("img", { name: /หมุดคำขออยู่กลางแผนที่/ }),
  ).toBeTruthy();
  expect(move).toHaveBeenLastCalledWith(14, 100);
  state.center = { lat: 14.01, lng: 100.02 };
  state.handlers.moveend?.();
  expect(move).toHaveBeenLastCalledWith(14.01, 100.02);
  state.setView.mockClear();
  rerender(
    <RequestLocationMarker
      position={{ lat: 14.01, lon: 100.02 }}
      onMove={move}
    />,
  );
  expect(state.setView).not.toHaveBeenCalled();
  rerender(
    <RequestLocationMarker position={{ lat: 15, lon: 101 }} onMove={move} />,
  );
  expect(state.setView).toHaveBeenCalledOnce();
  expect(move).toHaveBeenLastCalledWith(14.01, 100.02);
});
it("keeps a confirmed location fixed and removes the screen-center picker", () => {
  render(<RequestLocationMarker position={{ lat: 14, lon: 100 }} />);
  expect(state.marker?.draggable).toBe(false);
  expect(state.marker?.position).toEqual([14, 100]);
  expect(
    screen.queryByRole("img", { name: /หมุดคำขออยู่กลางแผนที่/ }),
  ).toBeNull();
});
