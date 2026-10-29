import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RequestTrackingCard from "./RequestTrackingCard";
import { REQUESTS_CHANGED } from "@/frontend/lib/measurement-events";
import type { MeasurementRequestView } from "@/frontend/types";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { measurementRequests: mocks.list },
}));
const row = {
  id: "mine",
  place_name: "สถานที่ A",
  is_owner: true,
  status: "active",
  radius_km: 3,
  created_at: "2026-10-29T00:00:00Z",
  starts_at: "2026-10-29T00:00:00Z",
  expires_at: "2099-10-29T01:00:00Z",
  recipient_count: 0,
  result: null,
} as MeasurementRequestView;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ requests: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows the tracking link without fetching private data for guests", () => {
  render(<RequestTrackingCard userId={null} />);
  expect(
    screen
      .getByRole("link", { name: /ติดตามคำขอค่าฝุ่น/ })
      .getAttribute("href"),
  ).toBe("/requests");
  expect(mocks.list).not.toHaveBeenCalled();
});
it("tracks the latest open owned request and does not show another person's request", async () => {
  mocks.list.mockResolvedValue({
    requests: [
      { ...row, id: "helper", place_name: "สถานที่ของคนอื่น", is_owner: false },
      {
        ...row,
        id: "cancelled",
        status: "cancelled",
        created_at: "2026-10-30T00:00:00Z",
      },
      row,
    ],
  });
  render(<RequestTrackingCard userId="viewer" />);
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "ส่งคำขอแล้ว · กำลังหาผู้ช่วย",
  );
  expect(screen.getByRole("list", { name: "ความคืบหน้าคำขอ" })).toBeTruthy();
  expect(screen.queryByText(/สถานที่ของคนอื่น/)).toBeNull();
  expect(
    screen.getByRole("link", { name: /ส่งคำขอแล้ว/ }).getAttribute("href"),
  ).toBe("/requests/mine");
});
it("updates the summary when a new response arrives and shows zero PM2.5 correctly", async () => {
  mocks.list
    .mockResolvedValueOnce({ requests: [{ ...row, recipient_count: 2 }] })
    .mockResolvedValue({
      requests: [
        {
          ...row,
          status: "fulfilled",
          result: { pm25: 0, captured_at: row.starts_at },
        },
      ],
    });
  render(<RequestTrackingCard userId="viewer" />);
  await screen.findByText("แจ้งผู้ช่วยแล้ว · กำลังรอรายงาน");
  await act(async () => window.dispatchEvent(new Event(REQUESTS_CHANGED)));
  await screen.findByText("ได้รับค่าฝุ่นแล้ว");
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.getByText(/µg\/m³/)).toBeTruthy();
});
it("shows expiration without a completed progress bar", async () => {
  mocks.list.mockResolvedValue({ requests: [{ ...row, status: "expired" }] });
  render(<RequestTrackingCard userId="viewer" />);
  await screen.findByText("หมดเวลา · ยังไม่มีคำตอบ");
  expect(screen.queryByRole("list")).toBeNull();
});
it("keeps the last known status and marks it stale when refresh fails", async () => {
  mocks.list
    .mockResolvedValueOnce({ requests: [row] })
    .mockRejectedValue(new Error("offline"));
  render(<RequestTrackingCard userId="viewer" />);
  await screen.findByText("ส่งคำขอแล้ว · กำลังหาผู้ช่วย");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("อัปเดตไม่สำเร็จ · แสดงสถานะล่าสุดที่โหลดได้");
  expect(screen.getByText("ส่งคำขอแล้ว · กำลังหาผู้ช่วย")).toBeTruthy();
});
it("refreshes every 15 seconds and never retains another account's summary", async () => {
  vi.useFakeTimers();
  mocks.list.mockResolvedValue({ requests: [row] });
  const { rerender } = render(<RequestTrackingCard userId="viewer" />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText("ส่งคำขอแล้ว · กำลังหาผู้ช่วย")).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(mocks.list).toHaveBeenCalledTimes(2);
  rerender(<RequestTrackingCard userId={null} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: /ติดตามคำขอค่าฝุ่น/ })
      .getAttribute("href"),
  ).toBe("/requests");
});
