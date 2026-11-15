import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DivIcon } from "leaflet";
import type { FirePoint } from "@/frontend/types";
import FireLayer from "./FireLayer";
const state = vi.hoisted(() => ({
  zoom: 6,
  active: null as string | null,
  flyToBounds: vi.fn(),
  clear: vi.fn(),
  select: vi.fn(),
}));
vi.mock("react-leaflet", () => ({
  useMapEvents: () => ({
    getZoom: () => state.zoom,
    getMaxZoom: () => 19,
    getBounds: () => ({ pad: () => ({ contains: () => true }) }),
    flyToBounds: state.flyToBounds,
  }),
}));
vi.mock("./PriorityMarker", () => ({
  useMarkerPriority: () => ({
    active: state.active,
    clear: state.clear,
    select: state.select,
  }),
  default: ({
    icon,
    title,
    priorityId,
    eventHandlers,
  }: {
    icon: DivIcon;
    title: string;
    priorityId: string;
    eventHandlers: { click: () => void };
  }) => (
    <button
      title={title}
      onClick={() => {
        state.active = priorityId;
        eventHandlers.click();
      }}
      dangerouslySetInnerHTML={{ __html: String(icon.options.html) }}
    />
  ),
}));
vi.mock("./MapSheetPortal", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.active = null;
  state.zoom = 6;
});
const point = (id: string, frp = 3.72): FirePoint => ({
  id,
  lat: 14,
  lon: 100,
  frp,
  bright: null,
  acq_date: "2026-11-15",
  acquired_at: "2026-11-15T06:24:00Z",
  confidence: "nominal",
  satellite: "VIIRS_NOAA20_NRT",
  source_products: ["VIIRS_NOAA20_NRT"],
  daynight: "D",
});
it("groups detections independently of FRP and zooms without treating the count as PM2.5", () => {
  render(<FireLayer fires={[point("a"), point("b", 100)]} />);
  const marker = screen.getByRole("button");
  expect(marker.title).toContain("จำนวนจุดตรวจพบ ไม่ใช่จำนวนเหตุไฟไหม้");
  expect(marker.querySelector("b")?.textContent).toBe("2");
  fireEvent.click(marker);
  expect(state.flyToBounds).toHaveBeenCalledWith(
    [
      [14, 100],
      [14, 100],
    ],
    expect.objectContaining({ maxZoom: 9 }),
  );
});
it("keeps coincident points accessible through a list at maximum zoom", () => {
  state.zoom = 19;
  const fires = [point("a"), point("b")];
  const { rerender } = render(<FireLayer fires={fires} />);
  fireEvent.click(screen.getByRole("button"));
  rerender(<FireLayer fires={fires} />);
  expect(state.flyToBounds).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /จุดที่ 2/ }));
  expect(state.select).toHaveBeenCalledWith("hotspot:b");
});
it("shows a short detail panel with readable source, Thai time and nominal confidence", () => {
  state.active = "hotspot:a";
  render(<FireLayer fires={[point("a")]} />);
  const sheet = screen.getByRole("region", { name: "จุดความร้อนจากดาวเทียม" });
  expect(sheet.getAttribute("data-snap")).toBe("fixed");
  expect(
    screen.queryByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  ).toBeNull();
  expect(screen.getByText("NASA FIRMS · NOAA-20 · VIIRS")).toBeTruthy();
  expect(screen.getByText("ปกติ")).toBeTruthy();
  expect(screen.getByText("3.72 MW")).toBeTruthy();
  expect(sheet.querySelector("time")?.textContent).toContain("13:24");
  expect(sheet.querySelector("time")?.textContent).toContain("เวลาไทย");
  expect(sheet.textContent).toContain("ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว");
});
it("labels missing source values honestly", () => {
  state.active = "hotspot:a";
  render(
    <FireLayer
      fires={[
        {
          ...point("a"),
          frp: null,
          confidence: null,
          acquired_at: null,
          satellite: null,
        },
      ]}
    />,
  );
  expect(screen.getByText("ไม่ระบุเวลาตรวจพบที่แน่นอน")).toBeTruthy();
  expect(screen.getByText("NASA FIRMS · ไม่ระบุดาวเทียม")).toBeTruthy();
  expect(screen.getAllByText("ไม่ระบุ")).toHaveLength(2);
});
