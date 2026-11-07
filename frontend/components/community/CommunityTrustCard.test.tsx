import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CommunityTrustCard from "./CommunityTrustCard";
import type { CommunityTrust } from "@/frontend/types/community-trust";
import { api } from "@/frontend/lib/api-client";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const trust: CommunityTrust = {
  policy_version: "community-trust-v1",
  status: "insufficient",
  score: null,
  window_start: "2026-08-10",
  window_end: "2026-11-07",
  unique_voter_accounts: 0,
  evaluated_report_count: 0,
  evaluated_day_count: 0,
  effective_day_weight: 0,
  last_feedback_at: null,
  calculated_at: null,
  contribution_days_30: 8,
  review_available: false,
  daily: [],
};
it("does not invent a zero when evidence is insufficient", () => {
  render(<CommunityTrustCard trust={trust} />);
  expect(screen.getByText("เสียงประเมินยังไม่เพียงพอ")).toBeTruthy();
  expect(screen.queryByText("0.0/100")).toBeNull();
  expect(screen.getByText(/ช่วยรายงาน 8 วัน/)).toBeTruthy();
});
it("shows a valid zero score separately from participation", () => {
  render(
    <CommunityTrustCard
      trust={{
        ...trust,
        status: "available",
        score: 0,
        unique_voter_accounts: 3,
        evaluated_report_count: 3,
        evaluated_day_count: 3,
      }}
    />,
  );
  expect(screen.getByText("0.0/100")).toBeTruthy();
  expect(screen.getByText(/บัญชีผู้ประเมิน 3 บัญชี/)).toBeTruthy();
});
it("keeps the last score labeled when a projection is updating", () => {
  render(
    <CommunityTrustCard
      trust={{ ...trust, status: "updating", score: 78.571428 }}
    />,
  );
  expect(screen.getByText("กำลังอัปเดต")).toBeTruthy();
  expect(screen.getByText(/ค่าล่าสุด 78.6\/100/)).toBeTruthy();
});
it("hides the whole score surface when feature or identity is private", () => {
  const { container } = render(<CommunityTrustCard trust={null} />);
  expect(container.textContent).toBe("");
});

it("keeps fresh review results when an earlier request resolves after submission", async () => {
  let resolveOld!: (value: { requests: never[] }) => void;
  const old = new Promise<{ requests: never[] }>((resolve) => {
    resolveOld = resolve;
  });
  const fresh = {
    requests: [
      {
        id: "new",
        status: "pending",
        created_at: "2026-11-07T01:00:00Z",
        from_day: "2026-11-01",
        to_day: "2026-11-07",
        message: "Please review these votes",
      },
    ],
  };
  const read = vi
    .spyOn(api, "communityTrustOwnerReviews")
    .mockReturnValueOnce(old)
    .mockResolvedValueOnce(fresh);
  vi.spyOn(api, "communityTrustReview").mockResolvedValue({
    id: "new",
    status: "pending",
  });
  render(
    <CommunityTrustCard
      trust={{ ...trust, review_available: true }}
      reviewable
    />,
  );
  const details = screen.getByText("ติดตามคำขอทบทวน").closest("details")!;
  act(() => {
    details.open = true;
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  expect(
    (
      (await screen.findByRole("button", {
        name: "กำลังโหลด…",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), {
    target: { value: "2026-11-01" },
  });
  fireEvent.change(screen.getByLabelText("ถึงวันที่"), {
    target: { value: "2026-11-07" },
  });
  fireEvent.change(screen.getByLabelText("เหตุผลขอทบทวน"), {
    target: { value: "Please review these votes" },
  });
  fireEvent.submit(screen.getByLabelText("เหตุผลขอทบทวน").closest("form")!);
  await screen.findByText("รอทบทวน");
  expect(screen.getByText("ช่วงวันที่ 2026-11-01 ถึง 2026-11-07")).toBeTruthy();
  await act(async () => {
    resolveOld({ requests: [] });
    await old;
  });
  expect(screen.getByText("รอทบทวน")).toBeTruthy();
  expect(screen.queryByText("ยังไม่มีคำขอทบทวน")).toBeNull();
});
