import { describe, expect, it } from "vitest";

import { cameraErrorMessage, fitCaptureDimensions } from "./camera";

describe("fitCaptureDimensions", () => {
  it("keeps a small camera frame unchanged", () => {
    expect(fitCaptureDimensions(1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("bounds portrait and landscape captures while preserving aspect ratio", () => {
    expect(fitCaptureDimensions(4032, 3024)).toEqual({
      width: 1920,
      height: 1440,
    });
    expect(fitCaptureDimensions(3024, 4032)).toEqual({
      width: 1440,
      height: 1920,
    });
  });

  it("rejects invalid capture dimensions and max edges", () => {
    expect(fitCaptureDimensions(0, 720)).toEqual({ width: 0, height: 0 });
    expect(fitCaptureDimensions(1280, -1)).toEqual({ width: 0, height: 0 });
    expect(fitCaptureDimensions(1280, 720, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("cameraErrorMessage", () => {
  it("gives actionable permission and device guidance", () => {
    expect(cameraErrorMessage("NotAllowedError")).toContain("อนุญาต");
    expect(cameraErrorMessage("NotFoundError")).toContain("ไม่พบกล้อง");
    expect(cameraErrorMessage("NotReadableError")).toContain("แอปอื่น");
  });

  it.each([
    "SecurityError",
    "DevicesNotFoundError",
    "TrackStartError",
    "OverconstrainedError",
    "ConstraintNotSatisfiedError",
    "AbortError",
    "UnexpectedError",
  ])("returns guidance for %s", (name) => {
    expect(cameraErrorMessage(name).length).toBeGreaterThan(0);
  });
});
