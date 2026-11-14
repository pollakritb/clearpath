import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DivIcon } from "leaflet";
import type { CommunityReport } from "@/frontend/types";
import ReportMarkers from "./ReportMarkers";
const mocks = vi.hoisted(() => ({ flyToBounds: vi.fn() }));
vi.mock("react-leaflet", () => ({
  useMapEvents: () => ({ getZoom: () => 6, flyToBounds: mocks.flyToBounds }),
}));
vi.mock("./PriorityMarker", () => ({
  default: ({
    icon,
    title,
    eventHandlers,
  }: {
    icon: DivIcon;
    title: string;
    eventHandlers: { click: () => void };
  }) => (
    <button
      title={title}
      onClick={eventHandlers.click}
      dangerouslySetInnerHTML={{ __html: String(icon.options.html) }}
    />
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const report = (id: string, value: number, age = 10) =>
  ({
    id,
    lat: 13.8,
    lon: 100.5,
    pm25: value,
    age_minutes: age,
    is_fresh: age <= 180,
    source_type: "individual",
    show_reporter_profile: false,
  }) as CommunityReport;
it("keeps nearby public report locations in their own group and expands to individual reports", () => {
  render(
    <ReportMarkers
      reports={[report("a", 12), report("b", 35), report("old", 999, 181)]}
      stacks={[]}
    />,
  );
  expect(screen.getByText("349")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.queryByText("999")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(mocks.flyToBounds).toHaveBeenCalledWith(
    [
      [13.8, 100.5],
      [13.8, 100.5],
      [13.8, 100.5],
    ],
    { padding: [48, 48], maxZoom: 14, animate: true, duration: 0.65 },
  );
});
it("never shows an old report range as current", () => {
  render(
    <ReportMarkers
      reports={[report("a", 12, 181), report("b", 35, 190)]}
      stacks={[]}
    />,
  );
  expect(screen.getByTitle(/มีข้อมูลเก่า/)).toBeTruthy();
  expect(screen.getByText("24")).toBeTruthy();
});

it("keeps a selected report separate from the map group", () => {
  const { container } = render(
    <ReportMarkers
      reports={[report("a", 12), report("b", 20), report("c", 25)]}
      stacks={[]}
      selectedId="a"
    />,
  );
  expect(
    container.querySelectorAll(".cp-community-marker.is-selected"),
  ).toHaveLength(1);
  expect(
    container.querySelector(".cp-community-map-group__count")?.textContent,
  ).toBe("2");
});
