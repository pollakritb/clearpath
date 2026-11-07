import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HotspotObservationTime from "./HotspotObservationTime";

afterEach(() => vi.useRealTimers());
it("shows acquisition age separately from the source timestamp and updates it", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T04:00:00Z"));
  render(<HotspotObservationTime value="2026-11-07T03:00:00Z" />);
  expect(screen.getByText(/1 ชม. 0 นาทีที่แล้ว/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText(/1 ชม. 1 นาทีที่แล้ว/)).toBeTruthy();
});
it("does not display an invalid observation date", () => {
  const { container } = render(<HotspotObservationTime value="invalid" />);
  expect(container.textContent).toBe("");
});
