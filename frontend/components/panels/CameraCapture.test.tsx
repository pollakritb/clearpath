import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CameraCapture from "./CameraCapture";

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), session: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { photoMetadata: mocks.metadata, captureSession: mocks.session },
  ApiError: class extends Error {},
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
beforeEach(() => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:photo"),
    revokeObjectURL: vi.fn(),
  });
  mocks.metadata.mockResolvedValue({
    width: 100,
    height: 50,
    mime: "image/jpeg",
    size_bytes: 100,
    exif_captured_at: null,
    exif_local_time: null,
    exif_timezone: null,
    exif_gps: { lat: 13.8, lon: 100.1 },
  });
  mocks.session.mockResolvedValue({ token: "session-token" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("gallery evidence", () => {
  it("requires measurement time and confirmation instead of treating upload time as capture time", async () => {
    const onCaptured = vi.fn();
    const { container } = render(
      <CameraCapture onCaptured={onCaptured} onCleared={vi.fn()} />,
    );
    const file = new File(["photo"], "meter.jpg", {
      type: "image/jpeg",
      lastModified: 1000,
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await screen.findByText(/ไม่พบเวลาถ่ายในภาพ/);
    const time = container.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement;
    expect(time.value).toBe("");
    expect(onCaptured).not.toHaveBeenCalled();
    fireEvent.change(time, { target: { value: "2020-01-02T10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "ใช้ภาพและเวลานี้" }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    expect(onCaptured.mock.calls[0][0]).toMatchObject({
      file,
      source: "gallery",
      burstFiles: [],
      measuredLocation: { lat: 13.8, lon: 100.1 },
      capturedAt: new Date("2020-01-02T10:30").toISOString(),
    });
    expect(onCaptured.mock.calls[0][0].fileLastModifiedAt).toBe(
      "1970-01-01T00:00:01.000Z",
    );
  });
});
