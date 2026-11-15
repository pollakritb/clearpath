import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import type { ReportDraftResponse } from "@/frontend/types";
import {
  clearPrivateDrafts,
  writePrivateDraft,
} from "@/frontend/lib/private-draft-memory";
import { useReportDraft } from "./useReportDraft";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  summary: vi.fn(),
  helper: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    createReportDraft: mocks.create,
    deleteReportDraft: mocks.remove,
    submitReportDraft: mocks.submit,
    xpSummary: mocks.summary,
    measurementHelper: mocks.helper,
  },
  apiErrorMessage: (_: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, localDemo: true }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: vi.fn() }),
}));
const draft = {
  id: "draft",
  ocr_pm25: 25,
  ocr_status: "ready",
  captured_at: "2026-11-15T01:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
} as ReportDraftResponse;
const evidence = () => ({
  file: new File(["pixels"], "meter.jpg", { type: "image/jpeg" }),
  burstFiles: [new File(["frame"], "frame.jpg")],
  sessionToken: "token",
  capturedAt: draft.captured_at,
  timezoneOffsetMinutes: -420,
  selectedAt: draft.captured_at,
  fileLastModifiedAt: draft.captured_at,
});
const options = () => ({
  location: { lat: 13.8, lon: 100.1, accuracy: 15, source: "gps" as const },
  onRequestLocation: vi.fn(),
  onSubmitted: vi.fn(),
});
const event = () =>
  ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>;
beforeEach(() => {
  clearPrivateDrafts();
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(draft);
  mocks.remove.mockResolvedValue({ ok: true });
  mocks.summary.mockRejectedValue(new Error("optional XP offline"));
  mocks.helper.mockRejectedValue(new Error("optional helper offline"));
  mocks.submit.mockResolvedValue({
    message: "published",
    review_outcome: "automatic_approved",
    report: { verified_pm25: 25 },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("discards analysed and unanalysed drafts without losing data on deletion failure", async () => {
  const { result } = renderHook(() => useReportDraft(options()));
  await act(async () => result.current.discardDraft());
  act(() => result.current.captureEvidence(evidence()));
  await waitFor(() => expect(result.current.draft).toBe(draft));
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  mocks.remove.mockRejectedValueOnce(new Error("offline"));
  await act(async () => result.current.discardDraft());
  expect(result.current.error).toContain("ทิ้งร่างไม่สำเร็จ");
  expect(result.current.draft).toBe(draft);
  await act(async () => result.current.discardDraft());
  expect(result.current.evidence).toBeNull();
  expect(result.current.draft).toBeNull();
  act(() => result.current.clearEvidence());
});
it("retakes only after the server discards a draft and keeps a failed retake retryable", async () => {
  const { result } = renderHook(() => useReportDraft(options()));
  await act(async () => result.current.retakePhoto());
  act(() => result.current.captureEvidence(evidence()));
  await waitFor(() => expect(result.current.draft).toBe(draft));
  mocks.remove.mockRejectedValueOnce(new Error("offline"));
  await act(async () => result.current.retakePhoto());
  expect(result.current.error).toContain("เริ่มถ่ายภาพใหม่ไม่สำเร็จ");
  expect(result.current.draft).toBe(draft);
  await act(async () => result.current.retakePhoto());
  expect(result.current.draft).toBeNull();
  expect(result.current.sending).toBe(false);
});
it("keeps an unsuccessful submission for retry and accepts a zero OCR reading", async () => {
  const opts = options();
  const { result } = renderHook(() => useReportDraft(opts));
  await act(async () => result.current.submit(event()));
  expect(mocks.submit).not.toHaveBeenCalled();
  mocks.create.mockResolvedValue({ ...draft, ocr_pm25: 0 });
  act(() => result.current.captureEvidence(evidence()));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  mocks.submit.mockRejectedValueOnce(new Error("offline"));
  await act(async () => result.current.submit(event()));
  expect(result.current.error).toContain("ส่งรายงานไม่สำเร็จ");
  expect(result.current.draft).not.toBeNull();
  await act(async () => result.current.submit(event()));
  expect(opts.onSubmitted).toHaveBeenCalledOnce();
  expect(result.current.evidence).toBeNull();
});
it("restores evidence awaiting GPS, then allows a failed analysis to retry", async () => {
  const opts = { ...options(), location: null };
  writePrivateDraft(
    JSON.stringify(["local", "report"]),
    { evidence: evidence(), draft: null },
    Date.now() + 60000,
  );
  const { result, rerender } = renderHook((props) => useReportDraft(props), {
    initialProps: opts as Parameters<typeof useReportDraft>[0],
  });
  expect(opts.onRequestLocation).toHaveBeenCalledOnce();
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.create.mockRejectedValueOnce(new Error("offline"));
  rerender(options());
  await waitFor(() =>
    expect(result.current.error).toContain("อ่านภาพไม่สำเร็จ"),
  );
  act(() => result.current.retryAnalysis());
  await waitFor(() => expect(result.current.draft?.id).toBe(draft.id));
});
it("does not publish a late submission result into an unmounted account", async () => {
  const opts = options();
  let finish!: (value: unknown) => void;
  mocks.submit.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result, unmount } = renderHook(() => useReportDraft(opts));
  act(() => result.current.captureEvidence(evidence()));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.submit(event());
  });
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  unmount();
  clearPrivateDrafts();
  await act(async () => {
    finish({
      message: "published",
      review_outcome: "automatic_approved",
      report: {},
    });
    await pending;
  });
  expect(opts.onSubmitted).not.toHaveBeenCalled();
});
