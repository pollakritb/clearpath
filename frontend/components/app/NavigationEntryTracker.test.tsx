import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Link from "next/link";
import NavigationEntryTracker from "./NavigationEntryTracker";
const state = vi.hoisted(() => ({ path: "/requests/id" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
beforeEach(() => {
  state.path = "/requests/id";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("does not turn a direct entry into an internal entry when returning with Back", () => {
  const replace = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation(() => {});
  const { rerender, getByText } = render(
    <>
      <NavigationEntryTracker />
      <Link href="/requests" data-safe-back onClick={(e) => e.preventDefault()}>
        Back
      </Link>
    </>,
  );
  fireEvent.click(getByText("Back"));
  state.path = "/requests";
  rerender(<NavigationEntryTracker />);
  expect(replace).not.toHaveBeenCalled();
});
it("still records ordinary in-app forward links", () => {
  const replace = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation(() => {});
  const { rerender, getByText } = render(
    <>
      <NavigationEntryTracker />
      <Link href="/requests" onClick={(e) => e.preventDefault()}>
        Requests
      </Link>
    </>,
  );
  fireEvent.click(getByText("Requests"));
  state.path = "/requests";
  rerender(<NavigationEntryTracker />);
  expect(replace).toHaveBeenCalledWith(
    expect.objectContaining({ cpInternalEntry: true }),
    "",
  );
});
