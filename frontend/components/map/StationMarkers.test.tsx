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

it("colours a previous-only cluster with a clock and excludes readings older than two hours", () => {
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
  expect(cluster.style.getPropertyValue("--marker-aqi")).toBe("#eab308");
  expect(cluster.querySelector(".cp-marker-previous")).not.toBeNull();
  expect(
    screen.getByTitle(/สีจากข้อมูลก่อนหน้า ไม่ใช่ค่าปัจจุบัน/),
  ).toBeTruthy();
});
it("keeps current cluster colour independent of previous concentrations", () => {
  const { container } = render(
    <StationMarkers stations={[source("a", 10, 20), source("b", 100, 150)]} />,
  );
  const cluster = container.querySelector(
    ".cp-official-cluster",
  ) as HTMLElement;
  expect(cluster.style.getPropertyValue("--marker-aqi")).toBe("#22c55e");
  expect(cluster.querySelector(".cp-marker-previous")).toBeNull();
});
