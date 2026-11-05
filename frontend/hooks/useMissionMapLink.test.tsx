import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMissionMapLink } from "./useMissionMapLink";
afterEach(() => vi.useRealTimers());
it("focuses a public task once, preserves manual browsing, and handles returning to the map", () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const { rerender } = renderHook(
    ({ active, link }) => useMissionMapLink(link, active, select),
    { initialProps: { active: true, link: "task|14.023|99.976" } },
  );
  act(() => vi.runAllTimers());
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ lat: 14.023, lon: 99.976, source: "local" }),
  );
  rerender({ active: true, link: "task|14.023|99.976" });
  act(() => vi.runAllTimers());
  expect(select).toHaveBeenCalledTimes(1);
  rerender({ active: false, link: "task|14.023|99.976" });
  rerender({ active: true, link: "task|14.023|99.976" });
  act(() => vi.runAllTimers());
  expect(select).toHaveBeenCalledTimes(2);
});
it("ignores malformed, nonfinite and out-of-region navigation input", () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const { rerender } = renderHook(
    ({ link }) => useMissionMapLink(link, true, select),
    { initialProps: { link: "task|null|null" } },
  );
  for (const link of [
    "task|NaN|100",
    "task|14|Infinity",
    "task||100",
    "task|91|100",
    "task|14|-1",
  ])
    rerender({ link });
  act(() => vi.runAllTimers());
  expect(select).not.toHaveBeenCalled();
});
