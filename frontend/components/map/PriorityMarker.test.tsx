import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PriorityMarker, { MarkerPriorityProvider } from "./PriorityMarker";
const mocks = vi.hoisted(() => ({ map: { eachLayer: vi.fn() } }));
vi.mock("react-leaflet", () => ({
  useMap: () => mocks.map,
  Marker: ({
    title,
    zIndexOffset,
    eventHandlers,
  }: {
    title: string;
    zIndexOffset: number;
    eventHandlers: { click: (event: unknown) => void };
  }) => (
    <button
      data-z={zIndexOffset}
      onClick={() => eventHandlers.click({ target: title })}
    >
      {title}
    </button>
  ),
}));
afterEach(cleanup);
it("keeps the latest clicked marker above every other type after React rerenders", () => {
  const select = vi.fn();
  const view = (savedBase: number) => (
    <MarkerPriorityProvider>
      <PriorityMarker
        priorityId="saved:1"
        position={[0, 0]}
        title="Saved"
        zIndexOffset={savedBase}
      />
      <PriorityMarker
        priorityId="station:1"
        position={[0, 0]}
        title="Station"
        zIndexOffset={2000}
        eventHandlers={{ click: select }}
      />
    </MarkerPriorityProvider>
  );
  const { rerender } = render(view(1000));
  fireEvent.click(screen.getByRole("button", { name: "Saved" }));
  expect(
    screen.getByRole("button", { name: "Saved" }).getAttribute("data-z"),
  ).toBe("100000");
  fireEvent.click(screen.getByRole("button", { name: "Station" }));
  expect(
    screen.getByRole("button", { name: "Station" }).getAttribute("data-z"),
  ).toBe("100000");
  expect(
    screen.getByRole("button", { name: "Saved" }).getAttribute("data-z"),
  ).toBe("1000");
  expect(select).toHaveBeenCalledOnce();
  rerender(view(3000));
  expect(
    screen.getByRole("button", { name: "Station" }).getAttribute("data-z"),
  ).toBe("100000");
});
