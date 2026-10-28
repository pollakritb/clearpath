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
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));
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
  it("previews the server-normalized iPhone JPEG while retaining the original for submission", async () => {
    let resolveMetadata!: (metadata: unknown) => void;
    mocks.metadata.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    const onCaptured = vi.fn();
    const { container } = render(
      <CameraCapture onCaptured={onCaptured} onCleared={vi.fn()} />,
    );
    const file = new File(["multi-picture-jpeg"], "IMG_1234.JPG", {
      type: "image/jpeg",
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    expect(screen.getByRole("status").textContent).toContain("กำลังอ่านภาพ");
    resolveMetadata({
      preview_data_url: "data:image/jpeg;base64,cHJldmlldw==",
      exif_local_time: "2020-01-02T10:30:00",
      exif_captured_at: null,
      exif_gps: { lat: 13.8, lon: 100.1 },
    });
    const image = await screen.findByRole("img");
    expect(image.getAttribute("src")).toBe(
      "data:image/jpeg;base64,cHJldmlldw==",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ใช้ภาพและเวลานี้" }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    expect(onCaptured.mock.calls[0][0].file).toBe(file);
  });

  it.each([
    ["meter.jpg", "image/jpeg"],
    ["IMG_1234.HEIC", "image/heic"],
    ["IMG_1234.HEIF", ""],
  ])("requires time confirmation for %s (%s)", async (filename, mime) => {
    const onCaptured = vi.fn();
    const { container } = render(
      <CameraCapture onCaptured={onCaptured} onCleared={vi.fn()} />,
    );
    const file = new File(["photo"], filename, {
      type: mime,
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
