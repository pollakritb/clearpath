import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReportForm from "./ReportForm";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), submit: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { createReportDraft: mocks.draft, submitReportDraft: mocks.submit },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, localDemo: true }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: () => false }),
}));
vi.mock("./CameraCapture", () => ({
  default: ({ onCaptured }: { onCaptured: (evidence: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onCaptured({
          file: new File(["original"], "meter.jpg", { type: "image/jpeg" }),
          burstFiles: [],
          sessionToken: "session",
          capturedAt: "2020-01-02T03:30:00Z",
          source: "gallery",
          measuredLocation: { lat: 13.8, lon: 100.1 },
        })
      }
    >
      เลือกภาพทดสอบ
    </button>
  ),
}));
vi.mock("./report/LocationCard", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.draft.mockResolvedValue({
    id: "draft",
    ocr_pm25: 42.5,
    ocr_status: "ready",
    captured_at: "2020-01-02T03:30:00Z",
  });
  mocks.submit.mockResolvedValue({
    review_outcome: "automatic_approved",
    report: { verified_pm25: 42.5 },
    message: "เผยแพร่แล้ว",
  });
});

it.each([
  [false, 0],
  [true, 1],
  [false, 2],
])(
  "reads OCR automatically and submits hide_identity=%s after %s checkbox clicks",
  async (hideIdentity, clicks) => {
    const onRequestLocation = vi.fn();
    const onSubmitted = vi.fn();
    const { container, rerender } = render(
      <ReportForm
        location={null}
        onRequestLocation={onRequestLocation}
        onSubmitted={onSubmitted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "เลือกภาพทดสอบ" }));
    expect(onRequestLocation).toHaveBeenCalledOnce();
    expect(mocks.draft).not.toHaveBeenCalled();
    const location = {
      lat: 14.3,
      lon: 100.4,
      accuracy: 15,
      source: "gps" as const,
    };
    rerender(
      <ReportForm
        location={location}
        onRequestLocation={onRequestLocation}
        onSubmitted={onSubmitted}
      />,
    );
    await screen.findByText("PM2.5 42.5 µg/m³");
    expect(mocks.draft).toHaveBeenCalledOnce();
    const form = mocks.draft.mock.calls[0][0] as FormData;
    expect(form.get("lat")).toBe("13.8");
    expect(form.get("submission_lat")).toBe("14.3");
    expect(
      container.querySelector('input:not([type="checkbox"]), textarea, select'),
    ).toBeNull();
    const checkbox = screen.getByRole("checkbox", {
      name: "ปิดบังตัวตนในรายงานนี้",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    for (let click = 0; click < Number(clicks); click += 1)
      fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(hideIdentity);
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenCalledWith("draft", {
      user_claimed_pm25: 42.5,
      bonus_gps: null,
      hide_identity: hideIdentity,
      measurement_stable: false,
      measurement_duration_seconds: 0,
    });
  },
);

it.each([true, false])(
  "refreshes bonus GPS automatically and still submits when GPS succeeds=%s",
  async (gpsWorks) => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          success: PositionCallback,
          error: PositionErrorCallback,
        ) =>
          gpsWorks
            ? success({
                coords: { latitude: 13.8, longitude: 100.1, accuracy: 10 },
              } as GeolocationPosition)
            : error({ code: 1 } as GeolocationPositionError),
      },
    });
    const submitted = vi.fn();
    render(
      <ReportForm
        measurementRequestId="request"
        location={{ lat: 13.8, lon: 100.1, accuracy: 10, source: "gps" }}
        onRequestLocation={vi.fn()}
        onSubmitted={submitted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "เลือกภาพทดสอบ" }));
    await screen.findByText("PM2.5 42.5 µg/m³");
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenCalledWith(
      "draft",
      expect.objectContaining({
        measurement_request_id: "request",
        bonus_gps: gpsWorks ? { lat: 13.8, lon: 100.1, accuracy_m: 10 } : null,
      }),
    );
  },
);
