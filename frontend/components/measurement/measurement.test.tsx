import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  LocationSuggestion,
  MeasurementRequestView,
} from "@/frontend/types";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  setHelper: vi.fn(),
  helper: vi.fn(),
  presence: vi.fn(),
  login: vi.fn(),
  decline: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    createMeasurementRequest: mocks.create,
    measurementHelper: mocks.helper,
    setMeasurementHelper: mocks.setHelper,
    measurementPresence: mocks.presence,
    declineMeasurementRequest: mocks.decline,
    cancelMeasurementRequest: mocks.cancel,
  },
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "viewer" }, localDemo: false, loading: false }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: mocks.login }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import CreateRequest from "./CreateRequest";
import HelperSettings from "./HelperSettings";
import HelperPresence from "./HelperPresence";
import { RequestSummary } from "./RequestsPage";

const place = {
  id: "A",
  name: "สถานที่ A",
  lat: 13.8,
  lon: 100.1,
} as LocationSuggestion;
const row = {
  id: "request",
  place_name: "สถานที่ A",
  lat: 13.8,
  lon: 100.1,
  radius_km: 3,
  starts_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  status: "active",
  is_owner: true,
  recipient_count: 0,
  result: null,
} as MeasurementRequestView;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockReturnValue(false);
  mocks.helper.mockResolvedValue({ enabled: false, observed_at: null });
  mocks.create.mockResolvedValue(row);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("creates an immediate request with 3 km default and shows tracking", async () => {
  render(<CreateRequest place={place} />);
  fireEvent.click(
    screen.getByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  );
  expect(
    screen.getByRole("button", { name: "3 กม." }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "ส่งคำขอ" }));
  await screen.findByText("บันทึกคำขอแล้ว");
  expect(mocks.create.mock.calls[0][0]).toMatchObject({
    place_name: "สถานที่ A",
    radius_km: 3,
    needed_by: null,
  });
  expect(
    screen.getByRole("link", { name: "ติดตามคำขอนี้" }).getAttribute("href"),
  ).toBe("/requests/request");
});
it("does not create a scheduled request until a time is selected", async () => {
  render(<CreateRequest place={place} />);
  fireEvent.click(
    screen.getByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "ก่อนเวลาที่กำหนด" }));
  fireEvent.click(screen.getByRole("button", { name: "ส่งคำขอ" }));
  expect(screen.getByRole("alert").textContent).toContain("เลือกเวลา");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("asks for explicit helper consent and defaults off", async () => {
  mocks.setHelper.mockResolvedValue({ enabled: true, observed_at: null });
  render(<HelperSettings />);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  await waitFor(() => expect(checkbox.disabled).toBe(false));
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  await waitFor(() => expect(mocks.setHelper).toHaveBeenCalledWith(true));
  expect(checkbox.checked).toBe(true);
});
it("never reads geolocation for a user who has not opted in", async () => {
  const getCurrentPosition = vi.fn();
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  render(<HelperPresence />);
  await waitFor(() => expect(mocks.helper).toHaveBeenCalled());
  expect(getCurrentPosition).not.toHaveBeenCalled();
});
it("samples GPS only after consent and sends its original timestamp", async () => {
  mocks.helper.mockResolvedValue({ enabled: true, observed_at: null });
  mocks.presence.mockResolvedValue({});
  const now = Date.now();
  const getCurrentPosition = vi.fn((success) =>
    success({
      timestamp: now,
      coords: { latitude: 13.8, longitude: 100.1, accuracy: 20 },
    }),
  );
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  render(<HelperPresence />);
  await waitFor(() =>
    expect(mocks.presence).toHaveBeenCalledWith({
      lat: 13.8,
      lon: 100.1,
      accuracy_m: 20,
      observed_at: new Date(now).toISOString(),
    }),
  );
});
it("allows a helper to decline and links reporting without manual measurement inputs", async () => {
  mocks.decline.mockResolvedValue({});
  const onChanged = vi.fn();
  render(
    <RequestSummary
      row={{
        ...row,
        is_owner: false,
        matched_location_at: new Date().toISOString(),
      }}
      actions
      onChanged={onChanged}
    />,
  );
  expect(
    screen.getByRole("link", { name: "ช่วยรายงาน" }).getAttribute("href"),
  ).toBe("/report?request=request");
  fireEvent.click(screen.getByRole("button", { name: "ไม่สะดวก" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(mocks.decline).toHaveBeenCalledWith("request");
  expect(screen.queryByRole("button", { name: "ยกเลิกคำขอ" })).toBeNull();
});
