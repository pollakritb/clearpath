import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearAccountData,
  accountKey,
  updateAccountData,
} from "@/frontend/lib/account-data-cache";
import type { XPSummary, ContributionMissions } from "@/frontend/types";
import ContributionOverview from "./ContributionOverview";
const mocks = vi.hoisted(() => ({ missions: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { contributionMissions: mocks.missions },
}));
const summary = {
  member_id: "MBR-fixture",
  launched_at: "2026-11-05T00:00:00Z",
  month_points: 30,
  week_days: 7,
  fulfilled_requests: 2,
  missions_completed: 0,
} as XPSummary;
beforeEach(() => {
  clearAccountData();
  vi.clearAllMocks();
  mocks.missions.mockResolvedValue({ missions: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("has a working retry when mission loading fails", async () => {
  mocks.missions.mockRejectedValueOnce(new Error("offline"));
  render(<ContributionOverview summary={summary} />);
  await screen.findByText("โหลดภารกิจไม่สำเร็จ");
  fireEvent.click(screen.getByRole("button", { name: "ลองโหลดภารกิจใหม่" }));
  await screen.findByText(
    "ขณะนี้ไม่มีภารกิจเปิด รายงานจุดที่คุณอยู่ได้ตามปกติ",
  );
  expect(mocks.missions).toHaveBeenCalledTimes(2);
  expect(screen.getByText("สัปดาห์นี้มีผลงาน 7 วัน")).toBeTruthy();
});

it("does not fetch missions while the overview is inactive", () => {
  render(<ContributionOverview summary={summary} active={false} />);
  expect(mocks.missions).not.toHaveBeenCalled();
});

it("removes a cached task exactly when it expires without waiting for the next network refresh", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  const mission = {
    id: "task",
    place_name: "พื้นที่ตัวอย่าง",
    lat: 14,
    lon: 100,
    radius_km: 2,
    starts_at: "2026-11-05T09:00:00Z",
    expires_at: "2026-11-05T10:00:01Z",
    potential_points: 5,
  };
  updateAccountData<ContributionMissions>(
    accountKey(summary.member_id, "contribution-missions"),
    { missions: [mission] },
  );
  render(<ContributionOverview summary={summary} />);
  expect(screen.getByRole("link", { name: "ดูพื้นที่บนแผนที่" })).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(1002));
  expect(screen.queryByRole("link", { name: "ดูพื้นที่บนแผนที่" })).toBeNull();
  expect(
    screen.getByText("ขณะนี้ไม่มีภารกิจเปิด รายงานจุดที่คุณอยู่ได้ตามปกติ"),
  ).toBeTruthy();
  expect(mocks.missions).not.toHaveBeenCalled();
});
