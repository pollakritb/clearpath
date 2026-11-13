import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AlertLocationControls from "./AlertLocationControls";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  gps: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    alertLocation: mocks.load,
    updateAlertLocation: mocks.save,
    clearAlertLocation: mocks.clear,
  },
  apiErrorMessage: () => "บันทึกตำแหน่งไม่สำเร็จ",
}));
vi.mock("@/frontend/components/auth/AlertLocationPresence", () => ({
  ALERT_LOCATION_CHANGED: "test:location",
}));
beforeEach(() => {
  mocks.load.mockResolvedValue({ status: "missing", observed_at: null });
  mocks.save.mockResolvedValue({
    status: "ready",
    observed_at: new Date().toISOString(),
  });
  mocks.clear.mockResolvedValue({ ok: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.gps },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("requires saved consent before requesting GPS", async () => {
  render(<AlertLocationControls enabled={false} />);
  const button = await screen.findByRole("button", {
    name: "อัปเดตตำแหน่งแจ้งเตือน",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(mocks.gps).not.toHaveBeenCalled();
});
it("saves original GPS timestamp and shows readiness only after server succeeds", async () => {
  const observed = Date.now() - 1000;
  mocks.gps.mockImplementation((success) =>
    success({
      timestamp: observed,
      coords: { latitude: 14, longitude: 100, accuracy: 15 },
    }),
  );
  render(<AlertLocationControls enabled />);
  fireEvent.click(
    await screen.findByRole("button", { name: "อัปเดตตำแหน่งแจ้งเตือน" }),
  );
  await screen.findByText("พร้อมใช้ค้นหาหมุดใกล้คุณ");
  expect(mocks.save).toHaveBeenCalledWith({
    lat: 14,
    lon: 100,
    accuracy_m: 15,
    observed_at: new Date(observed).toISOString(),
  });
  fireEvent.click(screen.getByRole("button", { name: "ลบตำแหน่งแจ้งเตือน" }));
  await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
  await screen.findByText("ยังไม่มีตำแหน่งสำหรับแจ้งค่าฝุ่น");
});
it("rejects coarse GPS and explains recovery", async () => {
  mocks.gps.mockImplementation((success) =>
    success({
      timestamp: Date.now(),
      coords: { latitude: 14, longitude: 100, accuracy: 1000 },
    }),
  );
  render(<AlertLocationControls enabled />);
  fireEvent.click(
    await screen.findByRole("button", { name: "อัปเดตตำแหน่งแจ้งเตือน" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "ตำแหน่งยังไม่แม่นยำพอ",
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not persist callbacks after account component unmount", async () => {
  let callback: (position: object) => void = () => undefined;
  mocks.gps.mockImplementation((success) => {
    callback = success;
  });
  const view = render(<AlertLocationControls enabled />);
  fireEvent.click(
    await screen.findByRole("button", { name: "อัปเดตตำแหน่งแจ้งเตือน" }),
  );
  view.unmount();
  callback({
    timestamp: Date.now(),
    coords: { latitude: 14, longitude: 100, accuracy: 10 },
  });
  expect(mocks.save).not.toHaveBeenCalled();
});

it("refreshes a background GPS update after a manual update", async () => {
  mocks.gps.mockImplementation((success) =>
    success({
      timestamp: Date.now(),
      coords: { latitude: 14, longitude: 100, accuracy: 10 },
    }),
  );
  render(<AlertLocationControls enabled />);
  fireEvent.click(
    await screen.findByRole("button", { name: "อัปเดตตำแหน่งแจ้งเตือน" }),
  );
  await screen.findByText("พร้อมใช้ค้นหาหมุดใกล้คุณ");
  mocks.load.mockResolvedValue({
    status: "stale",
    observed_at: new Date(Date.now() - 90000000).toISOString(),
  });
  window.dispatchEvent(new Event("test:location"));
  await screen.findByText("ตำแหน่งหมดอายุ กรุณาอัปเดต GPS");
});
