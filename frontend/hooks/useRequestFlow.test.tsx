import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useRequestFlow } from "./useRequestFlow";
afterEach(cleanup);

it("Back consumes the actual path including nested location searches and always reaches idle", () => {
  const { result } = renderHook(useRequestFlow);
  act(() => result.current.start());
  for (const step of ["pick", "search", "pick", "form"] as const)
    act(() => result.current.go(step));
  for (const step of ["pick", "search", "pick", "search", "idle"] as const) {
    act(() => result.current.back());
    expect(result.current.step).toBe(step);
  }
});
it("reselecting does not append form/picker loops and preserves the time draft", () => {
  const { result } = renderHook(useRequestFlow);
  act(() => result.current.start());
  act(() => result.current.go("pick"));
  act(() => result.current.go("form"));
  act(() =>
    result.current.setDraft({ scheduled: true, time: "2026-11-13T12:30" }),
  );
  for (let i = 0; i < 5; i++) {
    act(() => result.current.reselect());
    expect(result.current.step).toBe("pick");
    act(() => result.current.go("form"));
  }
  act(() => result.current.reselect());
  act(() => result.current.back());
  expect(result.current.step).toBe("search");
  expect(result.current.draft.time).toBe("2026-11-13T12:30");
  act(() => result.current.go("idle"));
  expect(result.current.draft).toEqual({ scheduled: false, time: "" });
});
it("direct place requests can edit their point and close/reopen starts clean", () => {
  const { result } = renderHook(useRequestFlow);
  act(() => {
    result.current.start();
    result.current.go("form");
  });
  act(() => result.current.reselect());
  expect(result.current.step).toBe("pick");
  act(() => result.current.back());
  expect(result.current.step).toBe("search");
  act(() => result.current.go("idle"));
  act(() => result.current.start());
  act(() => result.current.go("search"));
  act(() => result.current.back());
  expect(result.current.step).toBe("idle");
});
