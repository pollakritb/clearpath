import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RequestLocationMarker from "./RequestLocationMarker";

const captured = vi.hoisted(() => ({
  props: null as null | {
    draggable: boolean;
    position: number[];
    eventHandlers: { dragend: (event: unknown) => void };
  },
}));
vi.mock("react-leaflet", () => ({
  Marker: (props: NonNullable<typeof captured.props>) => {
    captured.props = props;
    return null;
  },
}));
afterEach(cleanup);

it("uses the dropped latitude and longitude for the draft request", () => {
  const move = vi.fn();
  render(
    <RequestLocationMarker position={{ lat: 14, lon: 100 }} onMove={move} />,
  );
  expect(captured.props?.draggable).toBe(true);
  expect(captured.props?.position).toEqual([14, 100]);
  captured.props?.eventHandlers.dragend({
    target: { getLatLng: () => ({ lat: 14.01, lng: 100.02 }) },
  });
  expect(move).toHaveBeenCalledWith(14.01, 100.02);
});

it("keeps the confirmed location fixed until the user chooses to reselect it", () => {
  render(<RequestLocationMarker position={{ lat: 14, lon: 100 }} />);
  expect(captured.props?.draggable).toBe(false);
});
