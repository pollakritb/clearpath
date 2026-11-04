import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RegisteredHelperSettings from "./RegisteredHelperSettings";
import HelperPresence from "./HelperPresence";
import HelpRequestButton from "./HelpRequestButton";
import type {
  MeasurementHelperSettings,
  MeasurementRequestView,
} from "@/frontend/types";
const mocks = vi.hoisted(() => ({
  helper: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  claim: vi.fn(),
  push: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    measurementHelper: mocks.helper,
    saveMeasurementLocation: mocks.save,
    deleteMeasurementLocation: mocks.remove,
    claimMeasurementHelp: mocks.claim,
    setMeasurementHelper: mocks.set,
  },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, localDemo: true, loading: false }),
}));
const settings: MeasurementHelperSettings = {
  enabled: true,
  observed_at: null,
  registered_locations_enabled: true,
  locations: [
    {
      slot: 1,
      name: "บ้าน",
      address: "นครปฐม",
      lat: 13.8,
      lon: 100.1,
      enabled: true,
    },
    {
      slot: 2,
      name: "ที่ทำงาน",
      address: "กรุงเทพ",
      lat: 13.7,
      lon: 100.5,
      enabled: true,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.helper.mockResolvedValue(settings);
  mocks.save.mockResolvedValue(settings.locations![0]);
  mocks.remove.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows two private saved areas and pauses an area without adding a third", async () => {
  const changed = vi.fn();
  render(<RegisteredHelperSettings settings={settings} onChange={changed} />);
  expect(screen.getByText("2/2 จุด")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "เพิ่มพื้นที่รับคำขอ" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "รับคำขอที่ ที่ทำงาน" }),
  );
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      { ...settings.locations![1], enabled: false },
      2,
    ),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledWith(settings));
});
it("deletes only the selected slot and refreshes settings", async () => {
  const changed = vi.fn();
  render(<RegisteredHelperSettings settings={settings} onChange={changed} />);
  fireEvent.click(screen.getAllByRole("button", { name: "ลบพื้นที่" })[1]);
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(2));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(settings));
});
it("never samples GPS for registered-area notifications", async () => {
  const gps = vi.fn();
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: gps } });
  render(<HelperPresence />);
  await waitFor(() => expect(mocks.helper).toHaveBeenCalled());
  expect(gps).not.toHaveBeenCalled();
});
it("opens reporting without claiming when automatic help is enabled", async () => {
  const now = Date.now();
  const request = {
    id: "REQ-000001",
    is_owner: false,
    declined: false,
    status: "active",
    starts_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 3600000).toISOString(),
    xp_enabled: true,
    automatic_help_enabled: true,
  } as MeasurementRequestView;
  render(<HelpRequestButton request={request} now={now} />);
  fireEvent.click(screen.getByRole("button", { name: "ช่วยรายงานค่าฝุ่น" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/report?request=REQ-000001"),
  );
  expect(mocks.claim).not.toHaveBeenCalled();
});
