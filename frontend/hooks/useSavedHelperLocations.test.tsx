import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSavedHelperLocations } from "./useSavedHelperLocations";
import { HELPER_LOCATIONS_CHANGED } from "@/frontend/lib/measurement-events";
const mocks = vi.hoisted(() => ({ helper: vi.fn() }));
vi.mock("@/frontend/lib/api-client", () => ({
  api: { measurementHelper: mocks.helper },
}));
const location = {
  slot: 1,
  name: "บ้าน",
  emoji: "🏠",
  lat: 13.8,
  lon: 100.1,
  enabled: true,
  address: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.helper.mockResolvedValue({
    enabled: true,
    registered_locations_enabled: true,
    locations: [location],
  });
});
afterEach(cleanup);
it("loads only for a signed-in user and hides private points immediately on account change", async () => {
  const { result, rerender } = renderHook(
    ({ user }) => useSavedHelperLocations(user),
    { initialProps: { user: null as string | null } },
  );
  expect(mocks.helper).not.toHaveBeenCalled();
  rerender({ user: "owner" });
  await waitFor(() => expect(result.current).toEqual([location]));
  mocks.helper.mockReturnValue(new Promise(() => {}));
  rerender({ user: "other" });
  expect(result.current).toEqual([]);
  rerender({ user: null });
  expect(result.current).toEqual([]);
});
it("refreshes emoji changes and deletion without keeping stale markers", async () => {
  const { result } = renderHook(() => useSavedHelperLocations("owner"));
  await waitFor(() => expect(result.current[0]?.emoji).toBe("🏠"));
  mocks.helper.mockResolvedValue({
    registered_locations_enabled: true,
    locations: [{ ...location, emoji: "🌳" }],
  });
  await act(async () => {
    window.dispatchEvent(new Event(HELPER_LOCATIONS_CHANGED));
  });
  expect(result.current[0]?.emoji).toBe("🌳");
  mocks.helper.mockResolvedValue({
    registered_locations_enabled: true,
    locations: [],
  });
  await act(async () => {
    window.dispatchEvent(new Event(HELPER_LOCATIONS_CHANGED));
  });
  expect(result.current).toEqual([]);
});
it("preserves per-place receiving settings when global notifications are paused", async () => {
  mocks.helper.mockResolvedValue({
    enabled: false,
    registered_locations_enabled: true,
    locations: [location],
  });
  const { result } = renderHook(() => useSavedHelperLocations("owner"));
  await waitFor(() => expect(result.current).toHaveLength(1));
  expect(result.current[0].enabled).toBe(true);
});
