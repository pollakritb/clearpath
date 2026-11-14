import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DivIcon } from "leaflet";
import type { Station } from "@/frontend/types";
import StationMarkers from "./StationMarkers";

vi.mock("react-leaflet", () => ({
  useMapEvents: () => ({
    getZoom: () => 7,
    getBounds: () => ({ pad: () => ({ contains: () => true }) }),
  }),
}));
vi.mock("./PriorityMarker", () => ({
  default: ({ icon, title }: { icon: DivIcon; title: string }) => (
    <div
      title={title}
      dangerouslySetInnerHTML={{ __html: String(icon.options.html) }}
    />
  ),
}));
afterEach(cleanup);
const source = (id: string, age: number, pm25: number): Station =>
  ({
    id,
    lat: 13.8,
    lon: 100.5,
    pm25,
    age_minutes: age,
    recorded_at: "2026-11-11T09:00:00Z",
    data_status: age <= 60 ? "fresh" : "expired",
    eligible_for_surface: age <= 60,
  }) as Station;

it("shows latest values from every station with an old-data indicator", () => {
  const { container } = render(
    <StationMarkers
      stations={[
        source("a", 70, 20),
        source("b", 100, 40),
        source("old", 121, 500),
      ]}
    />,
  );
  const cluster = container.querySelector(
    ".cp-official-cluster",
  ) as HTMLElement;
  expect(cluster.querySelector(".cp-cluster-count")?.textContent).toBe("3");
  expect(cluster.querySelector(".cp-marker-previous")).not.toBeNull();
  expect(screen.getByTitle(/มีข้อมูลเก่า/)).toBeTruthy();
  expect(cluster.querySelector(".cp-cluster-value")?.textContent).toBe("187");
});
it("keeps cluster count neutral when current and previous readings are mixed", () => {
  const { container } = render(
    <StationMarkers stations={[source("a", 10, 20), source("b", 100, 150)]} />,
  );
  const cluster = container.querySelector(
    ".cp-official-cluster",
  ) as HTMLElement;
  expect(cluster.querySelector(".cp-cluster-value")?.textContent).toBe("85");
  expect(cluster.querySelector(".cp-cluster-count")?.textContent).toBe("2");
  expect(cluster.querySelector(".cp-marker-previous")).not.toBeNull();
});

it.each([116, 120])(
  "preserves the original single-station colour at %s minutes",
  (age) => {
    const { container } = render(
      <StationMarkers stations={[source("single", age, 9)]} />,
    );
    const marker = container.querySelector(".cp-station-marker") as HTMLElement;
    expect(marker.style.getPropertyValue("--marker-aqi")).toBe("#3b82f6");
    expect(marker.querySelector("b")?.textContent).toBe("9");
    expect(marker.querySelector(".cp-marker-previous")).not.toBeNull();
  },
);
it("preserves the original gray marker beyond 120 minutes", () => {
  const { container } = render(
    <StationMarkers stations={[source("single", 121, 9)]} />,
  );
  expect(
    (
      container.querySelector(".cp-station-marker") as HTMLElement
    ).style.getPropertyValue("--marker-aqi"),
  ).toBe("#7b8583");
});

it("keeps the selected singleton visible while nearby points are grouped", () => {
  const { container } = render(
    <StationMarkers
      stations={[source("a", 10, 9), source("b", 10, 20), source("c", 10, 25)]}
      selectedId="a"
    />,
  );
  expect(
    container.querySelectorAll(".cp-station-marker.is-selected"),
  ).toHaveLength(1);
  expect(container.querySelector(".cp-cluster-count")?.textContent).toBe("2");
});
it("uses the unrounded mean when choosing a group colour", () => {
  const { container } = render(
    <StationMarkers
      stations={[source("a", 10, 15.1), source("b", 10, 15.7)]}
    />,
  );
  expect(
    (
      container.querySelector(".cp-official-cluster") as HTMLElement
    ).style.getPropertyValue("--marker-aqi"),
  ).toBe("#22c55e");
  expect(container.querySelector(".cp-cluster-value")?.textContent).toBe("15");
});
