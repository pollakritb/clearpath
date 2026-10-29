import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import RequestMarkers from "./RequestMarkers";
import {
  requestMapStatus,
  visibleMapRequests,
} from "@/frontend/lib/request-map";
import type { MeasurementRequestView } from "@/frontend/types";
vi.mock("react-leaflet", () => ({
  Marker: ({
    title,
    eventHandlers,
    children,
    icon,
    bubblingMouseEvents,
  }: {
    title: string;
    eventHandlers: { click: () => void };
    children: ReactNode;
    icon: { options: { html: string } };
    bubblingMouseEvents: boolean;
  }) => (
    <button
      title={title}
      data-icon={icon.options.html}
      data-bubbles={bubblingMouseEvents}
      onClick={eventHandlers.click}
    >
      {children}
    </button>
  ),
  Circle: ({ radius }: { radius: number }) => (
    <div data-testid="request-circle" data-radius={radius} />
  ),
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
afterEach(cleanup);
const now = Date.parse("2026-10-30T00:00:00Z");
const request = {
  id: "r",
  is_owner: true,
  place_name: "<img src=x onerror=alert(1)>",
  lat: 13.8,
  lon: 100.1,
  radius_km: 3,
  status: "active",
  expires_at: "2026-10-30T01:00:00Z",
} as MeasurementRequestView;
it("selects a saved request and shows its exact requested radius without injecting the place name into icon HTML", () => {
  const select = vi.fn();
  const { rerender } = render(
    <RequestMarkers requests={[request]} now={now} onSelect={select} />,
  );
  const marker = screen.getByRole("button");
  expect(marker.getAttribute("data-icon")).toContain("คำขอ · รอรายงาน");
  expect(marker.getAttribute("data-icon")).not.toContain("<img");
  expect(marker.getAttribute("data-bubbles")).toBe("false");
  expect(screen.queryByTestId("request-circle")).toBeNull();
  fireEvent.click(marker);
  expect(select).toHaveBeenCalledWith(request);
  rerender(
    <RequestMarkers
      requests={[request]}
      now={now}
      onSelect={select}
      selectedId="r"
    />,
  );
  expect(screen.getByTestId("request-circle").getAttribute("data-radius")).toBe(
    "3000",
  );
});
it("hides expired and cancelled requests even when selected, and keeps live requests", () => {
  const old = {
    ...request,
    id: "old",
    status: "expired",
    expires_at: "2026-10-28T00:00:00Z",
  } as MeasurementRequestView;
  const cancelled = {
    ...request,
    id: "cancelled",
    status: "cancelled",
  } as MeasurementRequestView;
  const rows = [
    request,
    old,
    cancelled,
    {
      ...request,
      id: "completed",
      status: "fulfilled",
    } as MeasurementRequestView,
  ];
  expect(visibleMapRequests(rows, now).map((r) => r.id)).toEqual([
    "r",
    "completed",
  ]);
  expect(visibleMapRequests(rows, now, "old").map((r) => r.id)).toEqual([
    "r",
    "completed",
  ]);
  expect(
    visibleMapRequests(rows, now, "cancelled").map((r) => r.id),
  ).not.toContain("cancelled");
  expect(
    requestMapStatus({ ...request, expires_at: "2026-10-29T23:00:00Z" }, now),
  ).toBe("expired");
});

it("hides a past deadline before the server status changes and activates a due scheduled request", () => {
  const stale = { ...request, expires_at: new Date(now - 1).toISOString() };
  expect(visibleMapRequests([stale], now, stale.id)).toEqual([]);
  expect(
    visibleMapRequests([{ ...request, expires_at: "invalid" }], now),
  ).toEqual([]);
  expect(
    requestMapStatus(
      {
        ...request,
        status: "scheduled",
        starts_at: new Date(now - 1).toISOString(),
      },
      now,
    ),
  ).toBe("active");
  expect(
    visibleMapRequests([{ ...request, status: "expired" }], now, request.id),
  ).toEqual([]);
});
