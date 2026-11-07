import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MapSearchPanel from "./MapSearchPanel";
import {
  rememberSearch,
  removeSearchHistory,
  searchHistoryKey,
} from "@/frontend/lib/search-history";
import type { Station } from "@/frontend/types";
const mocks = vi.hoisted(() => ({ owner: "search-ui-user", search: vi.fn() }));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useCurrentUserId: () => mocks.owner,
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { searchLocations: mocks.search },
}));
const place = {
  id: "park",
  name: "สวนทดสอบ",
  address: "นครปฐม",
  kind: "park",
  source: "local" as const,
  lat: 13.8,
  lon: 100,
};
const key = searchHistoryKey(mocks.owner);
beforeEach(() => {
  removeSearchHistory(key);
  mocks.search.mockResolvedValue({ locations: [place], coverage: "limited" });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("remembers a selected result and can remove it after reopening", async () => {
  const onLocationSelect = vi.fn();
  const close = vi.fn();
  const props = {
    stations: [],
    onClose: close,
    onLocationSelect,
    onStationSelect: vi.fn(),
  };
  const first = render(<MapSearchPanel {...props} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "สวน" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
  fireEvent.click(screen.getByRole("button", { name: /สวนทดสอบ/ }));
  expect(onLocationSelect).toHaveBeenCalledWith(place);
  expect(close).toHaveBeenCalledOnce();
  first.unmount();
  render(<MapSearchPanel {...props} />);
  expect(screen.getByRole("region", { name: "ประวัติการค้นหา" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "ลบ สวนทดสอบ จากประวัติ" }),
  );
  expect(screen.queryByRole("region", { name: "ประวัติการค้นหา" })).toBeNull();
});
it("selects the current station data from history and clears all saved selections", () => {
  rememberSearch(key, {
    key: "station:81t",
    kind: "station",
    stationId: "81t",
    location: { ...place, name: "สถานีทดสอบ" },
  });
  const current = {
    id: "81t",
    lat: 13.8,
    lon: 100,
    pm25: 18.5,
    name_th: "สถานีทดสอบ",
  } as Station;
  const select = vi.fn();
  const props = {
    stations: [current],
    onClose: vi.fn(),
    onLocationSelect: vi.fn(),
    onStationSelect: select,
  };
  const first = render(<MapSearchPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^สถานีทดสอบ/ }));
  expect(select).toHaveBeenCalledWith(current);
  first.unmount();
  render(<MapSearchPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติทั้งหมด" }));
  expect(screen.queryByRole("region", { name: "ประวัติการค้นหา" })).toBeNull();
});
it("cancels stale requests when the query is cleared", async () => {
  let resolve!: (value: unknown) => void;
  mocks.search.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <MapSearchPanel
      stations={[]}
      onClose={vi.fn()}
      onLocationSelect={vi.fn()}
      onStationSelect={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "สวน" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
  fireEvent.click(screen.getByRole("button", { name: "ล้างคำค้นหา" }));
  await act(async () => {
    resolve({ locations: [place], coverage: "limited" });
  });
  expect(screen.queryByRole("button", { name: /สวนทดสอบ/ })).toBeNull();
});
