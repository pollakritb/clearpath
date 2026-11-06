import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReportLocation } from "@/frontend/types/ui";
import ReportPageClient from "./ReportPageClient";
vi.mock("@/frontend/components/app/UserPageShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/frontend/components/panels/ReportForm", () => ({
  default: ({
    location,
    locationError,
    onRequestLocation,
  }: {
    location: ReportLocation | null;
    locationError: string | null;
    onRequestLocation: () => void;
  }) => (
    <>
      <button onClick={onRequestLocation}>รับ GPS</button>
      <output>{location?.lat ?? locationError ?? "รอ GPS"}</output>
    </>
  ),
}));
afterEach(cleanup);
it("does not let an old GPS callback override the latest permission failure on the report form", () => {
  const callbacks: {
    success: PositionCallback;
    failure: PositionErrorCallback;
  }[] = [];
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        success: PositionCallback,
        failure: PositionErrorCallback,
      ) => callbacks.push({ success, failure }),
    },
  });
  render(<ReportPageClient />);
  fireEvent.click(screen.getByRole("button", { name: "รับ GPS" }));
  fireEvent.click(screen.getByRole("button", { name: "รับ GPS" }));
  act(() => callbacks[1].failure({ code: 1 } as GeolocationPositionError));
  act(() =>
    callbacks[0].success({
      coords: { latitude: 13.8, longitude: 100.1, accuracy: 15 },
    } as GeolocationPosition),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "กรุณาอนุญาตตำแหน่ง",
  );
});
