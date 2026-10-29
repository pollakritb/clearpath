import { act, renderHook } from "@testing-library/react";
import { it, expect } from "vitest";
import { useMapDataMode } from "./useMapDataMode";
it("restores the previous observation mode and defaults a direct CAMS link to current", () => {
  const { result } = renderHook(() => useMapDataMode());
  act(() => result.current.setHistoryEnabled(true));
  act(() => result.current.toggleCams());
  expect(result.current.mode).toBe("cams");
  act(() => result.current.toggleCams());
  expect(result.current.mode).toBe("history");
  act(() => result.current.setHistoryEnabled(false));
  act(() => result.current.toggleCams());
  act(() => result.current.toggleCams());
  expect(result.current.mode).toBe("current");
  const direct = renderHook(() => useMapDataMode(true));
  act(() => direct.result.current.toggleCams());
  expect(direct.result.current.mode).toBe("current");
});
