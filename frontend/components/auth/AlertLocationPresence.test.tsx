import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AlertLocationPresence from "./AlertLocationPresence";
const mocks = vi.hoisted(() => ({
  preferences: vi.fn(),
  save: vi.fn(),
  permission: vi.fn(),
  gps: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ user: { id: "owner" }, localDemo: false, loading: false }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    notificationPreferences: mocks.preferences,
    updateAlertLocation: mocks.save,
  },
}));
beforeEach(() => {
  mocks.preferences.mockResolvedValue({
    consent_granted: true,
    air_alerts: true,
  });
  mocks.permission.mockResolvedValue({ state: "granted" });
  mocks.save.mockResolvedValue({ status: "ready" });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: mocks.permission },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.gps },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("does not read GPS without notification consent", async () => {
  mocks.preferences.mockResolvedValue({
    consent_granted: false,
    air_alerts: true,
  });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
});
it("does not automatically prompt for GPS permission", async () => {
  mocks.permission.mockResolvedValue({ state: "prompt" });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  expect(mocks.gps).not.toHaveBeenCalled();
});
it("preserves sample time and throttles foreground events", async () => {
  const observed = Date.now() - 500;
  mocks.gps.mockImplementation((success) =>
    success({
      timestamp: observed,
      coords: { latitude: 14, longitude: 100, accuracy: 10 },
    }),
  );
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0].observed_at).toBe(
    new Date(observed).toISOString(),
  );
  document.dispatchEvent(new Event("visibilitychange"));
  expect(mocks.preferences).toHaveBeenCalledOnce();
});
it("does not send a GPS callback after the account scope unmounts", async () => {
  let callback: (position: object) => void = () => undefined;
  mocks.gps.mockImplementation((success) => {
    callback = success;
  });
  const view = render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.gps).toHaveBeenCalledOnce());
  view.unmount();
  callback({
    timestamp: Date.now(),
    coords: { latitude: 14, longitude: 100, accuracy: 10 },
  });
  expect(mocks.save).not.toHaveBeenCalled();
});
