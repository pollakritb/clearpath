import {
  cleanup,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RequestMapCard from "./RequestMapCard";
import type { MeasurementRequestView } from "@/frontend/types";
const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  push: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    cancelMeasurementRequest: mocks.cancel,
    claimMeasurementHelp: mocks.claim,
  },
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
const render = renderUI;
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const request = {
  id: "own",
  is_owner: true,
  status: "active",
  starts_at: "2026-01-01T00:00:00Z",
  place_name: "สถานที่ A",
  radius_km: 3,
  expires_at: "2099-10-30T01:00:00Z",
} as MeasurementRequestView;
it("updates the map immediately after cancellation succeeds", async () => {
  const cancelled = {
    ...request,
    status: "cancelled",
  } as MeasurementRequestView;
  mocks.cancel.mockResolvedValue(cancelled);
  const updated = vi.fn();
  render(
    <RequestMapCard
      request={request}
      now={Date.now()}
      onClose={vi.fn()}
      onUpdated={updated}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกคำขอ" }));
  expect(mocks.cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกคำขอ" }));
  await waitFor(() => expect(updated).toHaveBeenCalledWith(cancelled));
  expect(mocks.cancel).toHaveBeenCalledWith("own");
});
it("keeps the marker when cancellation fails and allows retry", async () => {
  mocks.cancel.mockRejectedValue(new Error("offline"));
  const updated = vi.fn();
  render(
    <RequestMapCard
      request={request}
      now={Date.now()}
      onClose={vi.fn()}
      onUpdated={updated}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกคำขอ" }));
  expect(mocks.cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกคำขอ" }));
  await screen.findByRole("alert");
  expect(updated).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "ยกเลิกคำขอ" }).hasAttribute("disabled"),
  ).toBe(false);
});
it("does not offer to cancel someone else's request", () => {
  render(
    <RequestMapCard
      request={{ ...request, is_owner: false }}
      now={Date.now()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "ยกเลิกคำขอ" })).toBeNull();
});

it("starts help straight from the map and opens reporting once the claim succeeds", async () => {
  mocks.claim.mockResolvedValue({});
  render(
    <RequestMapCard
      request={{ ...request, is_owner: false, xp_enabled: true }}
      now={Date.now()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ช่วยรายงานค่าฝุ่น" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/report?request=own"),
  );
  expect(mocks.claim).toHaveBeenCalledOnce();
});

it("shows all request information and actions immediately without a collapsed state", () => {
  renderUI(
    <RequestMapCard
      request={{ ...request, recipient_count: 2 }}
      now={Date.now()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("region").dataset.snap).toBe("fixed");
  expect(
    screen.queryByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "เปิดรายละเอียดทั้งหมด" }),
  ).toBeNull();
  expect(screen.getByText("ส่งคำขอถึงผู้ช่วยวัด 2 คน")).toBeTruthy();
  expect(screen.getByText("ช่วงรับรายงาน · เวลาไทย")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "ยกเลิกคำขอ" }).closest("[inert]"),
  ).toBeNull();
  expect(screen.getByRole("region").dataset.expanded).toBe("true");
});

it("does not offer cancellation after the report window has expired before polling catches up", () => {
  render(
    <RequestMapCard
      request={{
        ...request,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }}
      now={Date.now()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "ยกเลิกคำขอ" })).toBeNull();
});
it("does not resume a completed request even if a help claim has time remaining", () => {
  render(
    <RequestMapCard
      request={{
        ...request,
        is_owner: false,
        status: "fulfilled",
        help_claim: {
          deadline: new Date(Date.now() + 600000).toISOString(),
        } as MeasurementRequestView["help_claim"],
      }}
      now={Date.now()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "วัดต่อจากภารกิจเดิม" }),
  ).toBeNull();
});

it("links the owner directly to the selected request without expanding", () => {
  render(
    <RequestMapCard request={request} now={Date.now()} onClose={vi.fn()} />,
  );
  expect(
    screen.getByRole("link", { name: "ติดตามคำขอ" }).getAttribute("href"),
  ).toBe("/requests/own");
  expect(
    screen.getByRole("link", { name: "ติดตามคำขอ" }).closest("[inert]"),
  ).toBeNull();
});
