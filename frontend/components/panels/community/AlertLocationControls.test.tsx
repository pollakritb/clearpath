import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AlertLocationControls from "./AlertLocationControls";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { alertLocation: mocks.load },
}));
vi.mock("@/frontend/components/auth/AlertLocationPresence", () => ({
  ALERT_LOCATION_CHANGED: "test:location",
}));
beforeEach(() =>
  mocks.load.mockResolvedValue({ status: "missing", observed_at: null }),
);
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows automatic status without manual GPS buttons or instructions", async () => {
  mocks.load.mockResolvedValue({
    status: "ready",
    observed_at: new Date().toISOString(),
  });
  render(<AlertLocationControls enabled />);
  await screen.findByText("พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByText(/กรุณา|อัปเดต GPS|วิธีใช้ตำแหน่ง/)).toBeNull();
  expect(screen.getByText(/อัปเดตอัตโนมัติเมื่ออนุญาตตำแหน่ง/)).toBeTruthy();
});
it("does not fetch location while alerts are off", () => {
  render(<AlertLocationControls enabled={false} />);
  expect(screen.getByText("ปิดแจ้งเตือนค่าฝุ่นอยู่")).toBeTruthy();
  expect(mocks.load).not.toHaveBeenCalled();
});
it("updates status automatically when a foreground GPS sample arrives", async () => {
  render(<AlertLocationControls enabled />);
  await screen.findByText("รอตำแหน่งล่าสุดจากเบราว์เซอร์");
  mocks.load.mockResolvedValue({
    status: "ready",
    observed_at: new Date().toISOString(),
  });
  window.dispatchEvent(new Event("test:location"));
  await screen.findByText("พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน");
});
it("does not present expired GPS as ready or ask for manual renewal", async () => {
  mocks.load.mockResolvedValue({
    status: "ready",
    observed_at: new Date(Date.now() - 86400001).toISOString(),
  });
  render(<AlertLocationControls enabled />);
  await screen.findByText("รอตำแหน่งล่าสุดจากเบราว์เซอร์");
  expect(screen.queryByText("พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน")).toBeNull();
});
it("ignores old responses and recovers from a read failure automatically", async () => {
  let resolveOld: (value: object) => void = () => undefined;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  render(<AlertLocationControls enabled />);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  mocks.load.mockRejectedValueOnce(new Error("offline"));
  window.dispatchEvent(new Event("test:location"));
  await screen.findByText("ตรวจสถานะตำแหน่งไม่ได้ชั่วคราว");
  resolveOld({ status: "ready", observed_at: new Date().toISOString() });
  await waitFor(() =>
    expect(screen.getByText("ตรวจสถานะตำแหน่งไม่ได้ชั่วคราว")).toBeTruthy(),
  );
  mocks.load.mockResolvedValue({
    status: "ready",
    observed_at: new Date().toISOString(),
  });
  window.dispatchEvent(new Event("test:location"));
  await screen.findByText("พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน");
});
