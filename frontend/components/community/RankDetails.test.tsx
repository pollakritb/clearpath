import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import RankDetails from "./RankDetails";

const rank = {
  code: "reporter",
  label: "ผู้รายงานชุมชน",
  minimum_xp: 100,
  minimum_days: 0,
  next_label: "ผู้ร่วมดูแลอากาศ",
  next_xp: 500,
  next_days: 0,
};

afterEach(cleanup);

it("opens the five levels, marks the current rank and restores focus on close", () => {
  render(<RankDetails rank={rank} xp={180} active />);
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => {
    dialog.removeAttribute("open");
    fireEvent(dialog, new Event("close"));
  };
  const trigger = screen.getByRole("button", {
    name: "ดูระดับปัจจุบัน: ผู้รายงานชุมชน",
  });
  fireEvent.click(trigger);
  const modal = screen.getByRole("dialog", { name: "ระดับและยศของคุณ" });
  expect(within(modal).getAllByRole("listitem")).toHaveLength(5);
  expect(modal.querySelector('[aria-current="step"]')?.textContent).toContain(
    "ผู้รายงานชุมชน",
  );
  expect(within(modal).getByText("180 คะแนนสะสม")).toBeTruthy();
  expect(
    within(modal).getByText("อีก 320 คะแนน ถึงยศผู้ร่วมดูแลอากาศ"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดระดับ" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("");
});

it("closes when leaving the overview and handles the highest rank", () => {
  const champion = {
    ...rank,
    code: "champion",
    label: "แกนนำอากาศสะอาด",
    minimum_xp: 5000,
    next_label: null,
    next_xp: null,
  };
  const { rerender } = render(<RankDetails rank={champion} xp={5100} active />);
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => {
    dialog.removeAttribute("open");
    fireEvent(dialog, new Event("close"));
  };
  fireEvent.click(
    screen.getByRole("button", { name: "ดูระดับปัจจุบัน: แกนนำอากาศสะอาด" }),
  );
  expect(screen.getByText("คุณได้รับยศสูงสุดแล้ว")).toBeTruthy();
  rerender(<RankDetails rank={champion} xp={5100} active={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
});
