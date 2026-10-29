import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  list: vi.fn(),
  search: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back }) }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    createMeasurementRequest: mocks.create,
    measurementHelper: mocks.helper,
    setMeasurementHelper: mocks.setHelper,
    measurementPresence: mocks.presence,
    declineMeasurementRequest: mocks.decline,
    cancelMeasurementRequest: mocks.cancel,
    measurementRequests: mocks.list,
    searchLocations: mocks.search,
  },
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "viewer" }, localDemo: false, loading: false }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: mocks.login }),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="preview-map" />,
}));
vi.mock("@/frontend/components/app/UserPageShell", () => ({
  default: ({ children }: { children: import("react").ReactNode }) => (
    <>{children}</>
  ),
}));
import CreateRequest from "./CreateRequest";
import HelperSettings from "./HelperSettings";
import HelperPresence from "./HelperPresence";
import RequestsPage, { RequestSummary } from "./RequestsPage";

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
  mocks.list.mockResolvedValue({ requests: [] });
  mocks.login.mockReturnValue(false);
  mocks.helper.mockResolvedValue({ enabled: false, observed_at: null });
  mocks.create.mockResolvedValue(row);
});

it("lists own and invited requests without location search or creation controls", async () => {
  mocks.list.mockResolvedValue({
    requests: [
      row,
      { ...row, id: "other-request", place_name: "สถานที่ B", is_owner: false },
    ],
  });
  render(<RequestsPage />);
  fireEvent.click(screen.getByRole("button", { name: "กลับ" }));
  expect(mocks.back).toHaveBeenCalledOnce();
  await screen.findByText("บริเวณสถานที่ B");
  expect(screen.getByRole("heading", { name: "คำขอของฉัน" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "คำขอจากคนอื่นให้ช่วยวัด" }),
  ).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "ติดตามคำขอ" })).toHaveLength(2);
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "ส่งคำขอ" })).toBeNull();
  expect(mocks.search).not.toHaveBeenCalled();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("moves a cancelled request into history and removes its map link", async () => {
  const cancelled = { ...row, status: "cancelled" } as MeasurementRequestView;
  mocks.list
    .mockResolvedValueOnce({ requests: [row] })
    .mockResolvedValue({ requests: [cancelled] });
  mocks.cancel.mockResolvedValue(cancelled);
  render(<RequestsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกคำขอ" }));
  const history = screen.getByRole("region", { name: "ประวัติคำขอ" });
  await waitFor(() =>
    expect(within(history).getByText("ยกเลิกแล้ว")).toBeTruthy(),
  );
  expect(screen.queryByRole("link", { name: "ดูจุดคำขอบนแผนที่" })).toBeNull();
  expect(
    within(history).getByRole("link", { name: "ดูประวัติคำขอ" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "ยกเลิกคำขอ" })).toBeNull();
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
    place_name: "บริเวณสถานที่ A",
    radius_km: 3,
    needed_by: null,
  });
  expect(
    screen.getByRole("link", { name: "ติดตามคำขอนี้" }).getAttribute("href"),
  ).toBe("/requests/request");
});
it("uses the main-map radius without a nested map or duplicate open button", async () => {
  const onRadiusChange = vi.fn();
  const { rerender } = render(
    <CreateRequest
      place={place}
      initiallyOpen
      mapContext
      selectedRadius={3}
      onRadiusChange={onRadiusChange}
    />,
  );
  expect(screen.queryByTestId("preview-map")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "5 กม." }));
  expect(onRadiusChange).toHaveBeenCalledWith(5);
  rerender(
    <CreateRequest
      place={place}
      initiallyOpen
      mapContext
      selectedRadius={5}
      onRadiusChange={onRadiusChange}
    />,
  );
  expect(
    screen.getByRole("button", { name: "5 กม." }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "ส่งคำขอ" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ radius_km: 5, lat: place.lat, lon: place.lon }),
    ),
  );
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
