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
  expect(sheet.getAttribute("data-snap")).toBe("half");
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
it("snaps upward drags and dismisses a deliberate downward drag", () => {
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
  expect(close).toHaveBeenCalledOnce();
});
