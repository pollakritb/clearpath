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
it("uses existing browser permission without a second notification consent", async () => {
  mocks.preferences.mockResolvedValue({
    consent_granted: false,
    air_alerts: true,
  });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
  await waitFor(() => expect(mocks.gps).toHaveBeenCalledOnce());
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

it("respects the air-alert off switch even with browser permission", async () => {
  mocks.preferences.mockResolvedValue({
    consent_granted: true,
    air_alerts: false,
  });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(mocks.gps).not.toHaveBeenCalled();
});
it("starts sampling when entry-page permission is granted and removes its listener on unmount", async () => {
  const permission = Object.assign(new EventTarget(), { state: "prompt" });
  mocks.permission.mockResolvedValue(permission);
  mocks.gps.mockImplementation((success) =>
    success({
      timestamp: Date.now(),
      coords: { latitude: 14, longitude: 100, accuracy: 10 },
    }),
  );
  const view = render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  expect(mocks.gps).not.toHaveBeenCalled();
  permission.state = "granted";
  permission.dispatchEvent(new Event("change"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  view.unmount();
  permission.dispatchEvent(new Event("change"));
  expect(mocks.save).toHaveBeenCalledOnce();
});
it("does not read GPS when browser permission is denied", async () => {
  mocks.permission.mockResolvedValue({ state: "denied" });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  expect(mocks.gps).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("keeps B as the latest pending location and flushes it on page hide", async () => {
  let position: PositionCallback = () => undefined;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((callback: PositionCallback) => {
        position = callback;
        return 7;
      }),
      clearWatch,
    },
  });
  const view = render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  const at = Date.now() - 1000;
  position({
    timestamp: at,
    coords: { latitude: 14, longitude: 100, accuracy: 10 },
  } as GeolocationPosition);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  position({
    timestamp: at + 500,
    coords: { latitude: 14.1, longitude: 100.1, accuracy: 10 },
  } as GeolocationPosition);
  expect(mocks.save).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event("pagehide"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[1]).toEqual([
    {
      lat: 14.1,
      lon: 100.1,
      accuracy_m: 10,
      observed_at: new Date(at + 500).toISOString(),
    },
    { keepalive: true },
  ]);
  expect(clearWatch).toHaveBeenCalledWith(7);
  view.unmount();
});

it("persists movement automatically after 30 seconds while the page stays open", async () => {
  let position: PositionCallback = () => undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((callback: PositionCallback) => {
        position = callback;
        return 8;
      }),
      clearWatch: vi.fn(),
    },
  });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  const at = Date.now() - 1000;
  position({
    timestamp: at,
    coords: { latitude: 14, longitude: 100, accuracy: 10 },
  } as GeolocationPosition);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  vi.useFakeTimers();
  try {
    position({
      timestamp: at + 500,
      coords: { latitude: 14.1, longitude: 100.1, accuracy: 10 },
    } as GeolocationPosition);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0].lat).toBe(14.1);
  } finally {
    vi.useRealTimers();
  }
});

it("persists the newest moving sample after 30 seconds without manual action", async () => {
  let position: PositionCallback = () => undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((callback: PositionCallback) => {
        position = callback;
        return 8;
      }),
      clearWatch: vi.fn(),
    },
  });
  render(<AlertLocationPresence />);
  await waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
  position({
    timestamp: Date.now() - 1000,
    coords: { latitude: 14, longitude: 100, accuracy: 10 },
  } as GeolocationPosition);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  vi.useFakeTimers();
  position({
    timestamp: Date.now(),
    coords: { latitude: 14.1, longitude: 100.1, accuracy: 10 },
  } as GeolocationPosition);
  expect(mocks.save).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30000);
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[1][0].lat).toBe(14.1);
  vi.useRealTimers();
});
