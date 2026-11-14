import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommunityReport } from "@/frontend/types";
import ReportEngagement from "./ReportEngagement";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
  location: vi.fn(),
}));
vi.mock("@/frontend/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "viewer" } }),
}));
vi.mock("@/frontend/components/auth/LoginPromptProvider", () => ({
  useLoginPrompt: () => ({ openLoginPrompt: vi.fn() }),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    myReportEngagement: mocks.get,
    setReportReaction: mocks.set,
    clearReportReaction: mocks.clear,
  },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/frontend/lib/reaction-location", () => ({
  requestReactionLocation: mocks.location,
}));
const report = { id: "RPT-test" } as CommunityReport;
const empty = {
  like_count: 0,
  dislike_count: 0,
  comment_count: 0,
  comments: [],
  viewer_reaction: null,
  location_required: true,
  location_policy_ready: true,
};
const fix = {
  lat: 14,
  lon: 100,
  accuracy_m: 16,
  observed_at: "2026-11-05T12:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(empty);
  mocks.location.mockResolvedValue(fix);
  mocks.set.mockResolvedValue({
    ...empty,
    like_count: 1,
    viewer_reaction: "like",
  });
});
afterEach(cleanup);

it("sends a fresh fix and lets an uncertain vote retry with another fix", async () => {
  mocks.set.mockRejectedValueOnce(
    new Error("ตำแหน่งยังคลาดเคลื่อนคร่อมขอบเขต กรุณาขอตำแหน่งใหม่"),
  );
  render(<ReportEngagement report={report} />);
  await screen.findByText(/โหวตใกล้จุดวัด/);
  fireEvent.click(screen.getByRole("button", { name: /^ถูกใจ/ }));
  await screen.findByRole("alert");
  expect(mocks.set).toHaveBeenCalledWith(report.id, {
    reaction: "like",
    location: fix,
    reason_code: "useful",
  });
  fireEvent.click(screen.getByRole("button", { name: /^ถูกใจ/ }));
  await waitFor(() => expect(mocks.location).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("withdraws an existing reaction without requesting GPS even when policy is unavailable", async () => {
  mocks.get.mockResolvedValue({
    ...empty,
    viewer_reaction: "like",
    like_count: 1,
    location_policy_ready: false,
  });
  mocks.clear.mockResolvedValue({ ...empty, location_policy_ready: false });
  render(<ReportEngagement report={report} />);
  await screen.findByText(/ยังไม่เปิดโหวตตามตำแหน่ง/);
  fireEvent.click(screen.getByRole("button", { name: /^ถูกใจ/ }));
  await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith(report.id));
  expect(mocks.location).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it("blocks voting until policy loads and lets a failed load retry", async () => {
  mocks.get.mockRejectedValueOnce(new Error("offline"));
  render(<ReportEngagement report={report} />);
  await screen.findByText("โหลดปฏิกิริยาและความคิดเห็นไม่สำเร็จ");
  const like = screen.getByRole("button", {
    name: /^ถูกใจ/,
  }) as HTMLButtonElement;
  expect(like.disabled).toBe(true);
  fireEvent.click(like);
  expect(mocks.location).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ลองโหลดใหม่" }));
  await screen.findByText(/โหวตใกล้จุดวัด/);
  expect(
    (screen.getByRole("button", { name: /^ถูกใจ/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /^ถูกใจ/ }));
  await waitFor(() => expect(mocks.location).toHaveBeenCalledOnce());
});

it("asks for a dislike reason before requesting GPS and preserves the selected reason", async () => {
  mocks.set.mockResolvedValue({
    ...empty,
    viewer_reaction: "dislike",
    dislike_count: 1,
  });
  render(<ReportEngagement report={report} />);
  await screen.findByText(/โหวตใกล้จุดวัด/);
  expect(screen.queryByLabelText("เหตุผลเมื่อไม่ถูกใจ")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^ไม่ถูกใจ/ }));
  const send = screen.getByRole("button", {
    name: "ส่งไม่ถูกใจ",
  }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  expect(mocks.location).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("เหตุผลเมื่อไม่ถูกใจ"), {
    target: { value: "value_question" },
  });
  fireEvent.click(send);
  await waitFor(() =>
    expect(mocks.set).toHaveBeenCalledWith(report.id, {
      reaction: "dislike",
      location: fix,
      reason_code: "value_question",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText("เหตุผลเมื่อไม่ถูกใจ")).toBeNull(),
  );
});

it("does not carry counts, selections or a late response into another report", async () => {
  let resolveFirst: (value: typeof empty) => void = () => undefined;
  mocks.get.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  const view = render(<ReportEngagement report={report} />);
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(report.id));
  view.rerender(
    <ReportEngagement report={{ ...report, id: "RPT-other", like_count: 7 }} />,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("RPT-other"));
  await screen.findByText(/โหวตใกล้จุดวัด/);
  resolveFirst({ ...empty, like_count: 99 });
  await waitFor(() => expect(screen.queryByText("99")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /^ถูกใจ/ }));
  await waitFor(() =>
    expect(mocks.set).toHaveBeenCalledWith(
      "RPT-other",
      expect.objectContaining({ reaction: "like" }),
    ),
  );
});

it("keeps summary actions in one shared portal and reveals the comment composer", async () => {
  const host = document.createElement("div");
  host.dataset.testid = "summary-actions";
  document.body.append(host);
  const reveal = vi.fn();
  const scroll = vi.fn();
  const previous = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  try {
    render(
      <ReportEngagement
        report={report}
        actionsContainer={host}
        onRevealDetails={reveal}
      />,
    );
    await screen.findByText(/โหวตใกล้จุดวัด/);
    const button = screen.getByRole("button", { name: /^ความคิดเห็น/ });
    expect(host.contains(button)).toBe(true);
    fireEvent.click(button);
    expect(reveal).toHaveBeenCalledOnce();
    const composer = screen.getByRole("textbox", { name: "เขียนความคิดเห็น" });
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    expect(
      screen.getByText("ข้อความแนะนำ").closest("details")?.hasAttribute("open"),
    ).toBe(false);
    fireEvent.change(composer, { target: { value: "ข้อความที่ยังไม่ได้ส่ง" } });
    fireEvent.click(button);
    expect(
      screen.queryByRole("textbox", { name: "เขียนความคิดเห็น" }),
    ).toBeNull();
    fireEvent.click(button);
    expect(
      (
        screen.getByRole("textbox", {
          name: "เขียนความคิดเห็น",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("ข้อความที่ยังไม่ได้ส่ง");
  } finally {
    host.remove();
    HTMLElement.prototype.scrollIntoView = previous;
  }
});
