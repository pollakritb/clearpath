import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import TodayPageClient from "./TodayPageClient";

const state = vi.hoisted(() => ({
  listRequests: vi.fn(),
  viewerId: "viewer",
  noop: vi.fn(),
  stations: [
    {
      id: "station",
      name_th: "สถานีทางการ",
      lat: 13.9,
      lon: 100.1,
      pm25: 10.2,
      in_service_area: true,
      recorded_at: null,
    },
  ],
  reports: [
    {
      id: "own",
      user_id: "viewer",
      display_name: "ตัวเอง",
      lat: 13.8,
      lon: 100.1,
      pm25: 99,
      captured_at: "2026-10-28T00:00:00Z",
    },
    {
      id: "neighbor",
      user_id: "neighbor-user",
      display_name: "เพื่อนบ้าน",
      lat: 13.801,
      lon: 100.1,
      pm25: 19,
      captured_at: "2026-10-28T00:00:00Z",
    },
  ],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.noop }) }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { measurementRequests: state.listRequests },
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useCurrentUserId: () => state.viewerId,
}));
vi.mock("@/frontend/components/app/UserPageShell", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/frontend/components/app/NationalSummary", () => ({
  default: () => null,
}));
vi.mock("@/frontend/components/panels/ForecastPanel", () => ({
  default: () => null,
}));
vi.mock("@/frontend/hooks/useCurrentLocation", () => ({
  useCurrentLocation: () => ({
    location: { lat: 13.8, lon: 100.1 },
    request: state.noop,
  }),
}));
vi.mock("@/frontend/hooks/usePm25", () => ({
  usePm25: () => ({
    stations: state.stations,
    counts: {},
    refresh: state.noop,
  }),
}));
vi.mock("@/frontend/hooks/useCommunity", () => ({
  useCommunityMapData: () => ({ reports: state.reports, refresh: state.noop }),
}));
vi.mock("@/frontend/hooks/useWeather", () => ({
  useWeather: () => ({ data: null, load: state.noop }),
}));
vi.mock("@/frontend/hooks/useHistory", () => ({
  useHistory: () => ({ points: [], load: state.noop }),
}));
vi.mock("@/frontend/hooks/useForecast", () => ({
  useForecast: () => ({ data: null, load: state.noop }),
}));

afterEach(cleanup);
beforeEach(() => {
  state.viewerId = "viewer";
  vi.clearAllMocks();
  state.listRequests.mockResolvedValue({ requests: [] });
});

describe("Today nearest source", () => {
  it("shows a neighbor report instead of the farther station and excludes self", () => {
    render(<TodayPageClient />);
    expect(screen.getByText("19")).toBeTruthy();
    expect(screen.getByText("รายงานจาก เพื่อนบ้าน")).toBeTruthy();
    expect(state.noop).toHaveBeenCalledWith({ lat: 13.801, lon: 100.1 }, 120);
    expect(
      screen.getByRole("region", { name: "ค่าฝุ่นใกล้ที่สุดและพยากรณ์" }),
    ).toBeTruthy();
    expect(screen.queryByText("99")).toBeNull();
    expect(screen.queryByText("10.2")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /ติดตามคำขอค่าฝุ่น/ })
        .getAttribute("href"),
    ).toBe("/requests");
    expect(
      screen.queryByRole("link", { name: /ขอค่าฝุ่นจากชุมชน/ }),
    ).toBeNull();
  });

  it("keeps an explicitly selected station separate from automatic GPS selection", () => {
    render(<TodayPageClient stationId="station" />);
    expect(screen.getByText("10.2")).toBeTruthy();
    expect(state.noop).toHaveBeenCalledWith("station", 120);
    expect(screen.queryByText("รายงานจาก เพื่อนบ้าน")).toBeNull();
  });
});
