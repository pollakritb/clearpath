import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MapBottomSheet from "./MapBottomSheet";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("provides keyboard alternatives to sliding and hides collapsed actions", () => {
  const close = vi.fn();
  const action = vi.fn();
  render(
    <MapBottomSheet label="Test sheet" header={<h2>Place</h2>} onClose={close}>
      <button onClick={action}>Report</button>
    </MapBottomSheet>,
  );
  const sheet = screen.getByRole("region", { name: "Test sheet" });
  const grip = screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  expect(sheet.getAttribute("data-snap")).toBe("peek");
  fireEvent.keyDown(grip, { key: "Home" });
  expect(sheet.getAttribute("data-snap")).toBe("peek");
  expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  fireEvent.keyDown(grip, { key: "End" });
  expect(sheet.getAttribute("data-snap")).toBe("full");
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(action).toHaveBeenCalledOnce();
  expect(sheet.getAttribute("data-snap")).toBe("full");
  fireEvent.click(screen.getByRole("button", { name: "ปิดแผงข้อมูล" }));
  expect(close).toHaveBeenCalledOnce();
});
it("snaps upward to full and downward to summary without closing", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const close = vi.fn();
  render(
    <MapBottomSheet label="Drag sheet" header={<h2>Place</h2>} onClose={close}>
      Content
    </MapBottomSheet>,
  );
  const grip = screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  const sheet = screen.getByRole("region", { name: "Drag sheet" });
  fireEvent.pointerDown(grip, { button: 0, clientY: 500 });
  fireEvent.pointerMove(grip, { clientY: 200 });
  fireEvent.pointerUp(grip);
  expect(sheet.getAttribute("data-snap")).toBe("full");
  fireEvent.pointerDown(grip, { button: 0, clientY: 200 });
  fireEvent.pointerMove(grip, { clientY: 800 });
  fireEvent.pointerUp(grip);
  expect(sheet.getAttribute("data-snap")).toBe("peek");
  expect(close).not.toHaveBeenCalled();
});
it("expands a touch swipe from content and lets full-view content scroll before collapsing at the top", () => {
  const close = vi.fn();
  render(
    <MapBottomSheet
      label="Touch sheet"
      header={<h2>Summary</h2>}
      onClose={close}
    >
      <p>Long content</p>
    </MapBottomSheet>,
  );
  const sheet = screen.getByRole("region", { name: "Touch sheet" });
  const heading = screen.getByText("Summary");
  const touch = (clientY: number) => [{ clientX: 100, clientY, identifier: 0 }];
  fireEvent.touchStart(heading, { touches: touch(500) });
  fireEvent.touchMove(heading, { touches: touch(420) });
  fireEvent.touchEnd(heading, { touches: [] });
  expect(sheet.getAttribute("data-snap")).toBe("full");
  const scroll = heading.closest("section")!.firstElementChild as HTMLElement;
  scroll.scrollTop = 100;
  fireEvent.touchStart(scroll, { touches: touch(200) });
  fireEvent.touchMove(scroll, { touches: touch(300) });
  fireEvent.touchEnd(scroll, { touches: [] });
  expect(sheet.getAttribute("data-snap")).toBe("full");
  scroll.scrollTop = 0;
  fireEvent.touchStart(scroll, { touches: touch(200) });
  fireEvent.touchMove(scroll, { touches: touch(300) });
  fireEvent.touchEnd(scroll, { touches: [] });
  expect(sheet.getAttribute("data-snap")).toBe("peek");
  expect(close).not.toHaveBeenCalled();
});
