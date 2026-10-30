import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCamsPresentation } from "./useCamsPresentation";
import { prepareCamsRaster } from "@/frontend/lib/cams-raster-client";
import type { useForecastGrid } from "./useForecastGrid";
import type { GridSurface } from "@/frontend/types/ui";
const images = new Map<string, string>();
vi.mock("@/frontend/lib/cams-raster-client", () => ({
  prepareCamsRaster: vi.fn(),
  cachedCamsRaster: (surface: GridSurface) => images.get(surface.validAt),
}));
const surface = (at: string): GridSurface => ({
  validAt: at,
  generationId: "g",
  latitudes: [13, 14],
  longitudes: [100, 101],
  values: [10, 20, 30, 40],
});
const grids = new Map<string | null, ReturnType<typeof useForecastGrid>>();
function grid(at: string | null) {
  const hit = grids.get(at);
  if (hit) return hit;
  const value = {
    surface: at ? surface(at) : null,
    at,
    times: ["a", "b", "c"],
    meta: null,
    loading: false,
    playing: true,
    pendingAt: null,
    error: null,
  } as unknown as ReturnType<typeof useForecastGrid>;
  grids.set(at, value);
  return value;
}
beforeEach(() => {
  images.clear();
  grids.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
it("keeps raster, point value and timestamp together and discards late raster results", async () => {
  const finish = new Map<string, () => void>();
  vi.mocked(prepareCamsRaster).mockImplementation(
    (surface) =>
      new Promise((resolve) => {
        finish.set(surface.validAt, () => {
          images.set(surface.validAt, "url");
          resolve("url");
        });
      }),
  );
  const { result, rerender } = renderHook(
    ({ at }) => useCamsPresentation(grid(at)),
    { initialProps: { at: "a" } },
  );
  expect(result.current.loading).toBe(true);
  await act(async () => finish.get("a")!());
  expect(result.current.at).toBe("a");
  rerender({ at: "b" });
  expect(result.current.at).toBe("a");
  expect(result.current.surface?.values[0]).toBe(10);
  expect(result.current.pendingAt).toBe("b");
  expect(result.current.playing).toBe(true);
  rerender({ at: "c" });
  await act(async () => finish.get("c")!());
  await act(async () => finish.get("b")!());
  expect(result.current.at).toBe("c");
  expect(result.current.pendingAt).toBeNull();
  expect(result.current.playing).toBe(true);
});
it("clears the surface when the layer closes or a complete frame is absent", async () => {
  vi.mocked(prepareCamsRaster).mockResolvedValue("url");
  images.set("a", "url");
  const { result, rerender } = renderHook(
    ({ at }) => useCamsPresentation(grid(at)),
    { initialProps: { at: "a" as string | null } },
  );
  await act(async () => {});
  expect(result.current.surface).not.toBeNull();
  rerender({ at: null });
  expect(result.current.surface).toBeNull();
});
it("exposes a failed image preparation instead of silently waiting forever", async () => {
  vi.mocked(prepareCamsRaster).mockRejectedValue(Error("canvas failure"));
  const { result } = renderHook(() => useCamsPresentation(grid("a")));
  await act(async () => {});
  expect(result.current.error).toContain("เตรียมภาพพยากรณ์ไม่สำเร็จ");
});
