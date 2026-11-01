import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  accountKey,
  accountSnapshot,
  clearAccountData,
} from "@/frontend/lib/account-data-cache";
import { useAccountData } from "./useAccountData";
beforeEach(clearAccountData);
afterEach(cleanup);
it("switches accounts without showing the previous account's private data", async () => {
  const loadOne = vi.fn(async () => "private one");
  const loadTwo = vi.fn(async () => "private two");
  const { result, rerender } = renderHook(
    ({ owner, loader }) => useAccountData(owner, "reports", loader),
    { initialProps: { owner: "one", loader: loadOne } },
  );
  await waitFor(() => expect(result.current.data).toBe("private one"));
  rerender({ owner: "two", loader: loadTwo });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toBe("private two"));
});
it("does not allow a late UI callback to restore private data after logout", async () => {
  const loader = vi.fn(async () => "private one");
  const { result, rerender } = renderHook(
    ({ owner }: { owner: string | null }) =>
      useAccountData(owner, "reports", loader),
    { initialProps: { owner: "one" as string | null } },
  );
  await waitFor(() => expect(result.current.data).toBe("private one"));
  const lateSetter = result.current.setData;
  act(() => {
    clearAccountData();
    rerender({ owner: null });
    lateSetter("late private data");
  });
  expect(accountSnapshot(accountKey("one", "reports")).data).toBeUndefined();
});
it("keeps hidden sections from fetching until they are opened", async () => {
  const loader = vi.fn(async () => 1);
  const { result, rerender } = renderHook(
    ({ active }) => useAccountData("one", "summary", loader, active),
    { initialProps: { active: false } },
  );
  expect(loader).not.toHaveBeenCalled();
  rerender({ active: true });
  await waitFor(() => expect(result.current.data).toBe(1));
  rerender({ active: false });
  rerender({ active: true });
  expect(result.current.data).toBe(1);
  expect(loader).toHaveBeenCalledTimes(1);
});
