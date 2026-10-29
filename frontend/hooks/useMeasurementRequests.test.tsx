import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMeasurementRequests } from "./useMeasurementRequests";
import { REQUESTS_CHANGED } from "@/frontend/lib/measurement-events";
import type { MeasurementRequestView } from "@/frontend/types";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { measurementRequests: mocks.list },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ requests: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("does not poll a hidden persistent map or a signed-out account", async () => {
  const { rerender } = renderHook(
    ({ userId, active }) => useMeasurementRequests(userId, active),
    { initialProps: { userId: null as string | null, active: true } },
  );
  expect(mocks.list).not.toHaveBeenCalled();
  rerender({ userId: "viewer", active: false });
  expect(mocks.list).not.toHaveBeenCalled();
  rerender({ userId: "viewer", active: true });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
});
it("preserves a newly created marker over a stale in-flight response", async () => {
  let resolve!: (value: { requests: MeasurementRequestView[] }) => void;
  mocks.list.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(() => useMeasurementRequests("viewer"));
  const row = { id: "new", is_owner: true } as MeasurementRequestView;
  act(() => result.current.upsert(row));
  await act(async () => resolve({ requests: [] }));
  expect(result.current.rows).toEqual([row]);
  mocks.list.mockResolvedValue({ requests: [{ ...row, status: "fulfilled" }] });
  await act(async () => window.dispatchEvent(new Event(REQUESTS_CHANGED)));
  expect(result.current.rows[0].status).toBe("fulfilled");
});
it("skips requests in a background tab and refreshes on returning", async () => {
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  const { result } = renderHook(() => useMeasurementRequests("viewer"));
  expect(mocks.list).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(mocks.list).toHaveBeenCalledOnce();
  expect(result.current.failed).toBe(false);
});
it("drops an old account response after signing out", async () => {
  let resolve!: (value: { requests: MeasurementRequestView[] }) => void;
  mocks.list.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(
    ({ userId }) => useMeasurementRequests(userId),
    { initialProps: { userId: "viewer" as string | null } },
  );
  rerender({ userId: null });
  act(() => result.current.upsert({ id: "ignored" } as MeasurementRequestView));
  await act(async () =>
    resolve({ requests: [{ id: "private" } as MeasurementRequestView] }),
  );
  expect(result.current.rows).toEqual([]);
});
