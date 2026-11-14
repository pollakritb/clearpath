import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

it("fits short details and caps asynchronously growing content to the map viewport", () => {
  let contentHeight = 120;
  let resize = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height = this.classList.contains("cp-map")
        ? 800
        : this.firstElementChild?.hasAttribute("data-sheet-grip")
          ? 96
          : 0;
      return {
        x: 0,
        y: 0,
        width: 390,
        height,
        top: 0,
        left: 0,
        right: 390,
        bottom: height,
        toJSON() {},
      };
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute("aria-hidden") && this.hasAttribute("id")
        ? contentHeight
        : 0;
    },
  );
  render(
    <div className="cp-map">
      <MapBottomSheet
        label="Content-sized sheet"
        header={<h2>Place</h2>}
        onClose={vi.fn()}
      >
        <p>Details loaded asynchronously</p>
      </MapBottomSheet>
    </div>,
  );
  const sheet = screen.getByRole("region", { name: "Content-sized sheet" });
  const grip = screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  fireEvent.keyDown(grip, { key: "End" });
  expect(sheet.style.getPropertyValue("--sheet-height")).toBe("216px");
  contentHeight = 1000;
  act(() => resize());
  expect(sheet.style.getPropertyValue("--sheet-height")).toBe("708px");
  contentHeight = 120;
  act(() => resize());
  expect(sheet.style.getPropertyValue("--sheet-height")).toBe("216px");
});

it("expands an existing peek sheet when a summary action requests details", () => {
  const props = {
    label: "Report actions",
    header: <h2>Report</h2>,
    onClose: vi.fn(),
  };
  const { rerender } = render(
    <MapBottomSheet {...props} expandSignal={0}>
      <textarea aria-label="Comment" />
    </MapBottomSheet>,
  );
  const sheet = screen.getByRole("region", { name: "Report actions" });
  expect(sheet.getAttribute("data-snap")).toBe("peek");
  rerender(
    <MapBottomSheet {...props} expandSignal={1}>
      <textarea aria-label="Comment" />
    </MapBottomSheet>,
  );
  expect(sheet.getAttribute("data-snap")).toBe("full");
  expect(screen.getByRole("textbox", { name: "Comment" })).not.toBeNull();
});

it("previews report content while keeping its controls inert until expanded", () => {
  render(
    <MapBottomSheet
      label="Preview sheet"
      header={<h2>Report</h2>}
      onClose={vi.fn()}
      previewHeight={64}
    >
      <button>Evidence</button>
    </MapBottomSheet>,
  );
  const sheet = screen.getByRole("region", { name: "Preview sheet" });
  expect(sheet.getAttribute("data-preview")).toBe("true");
  expect(screen.queryByRole("button", { name: "Evidence" })).toBeNull();
  const content = screen.getByText("Evidence").parentElement!;
  expect(content.hasAttribute("inert")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "เปิดรายละเอียดทั้งหมด" }),
  );
  expect(sheet.getAttribute("data-snap")).toBe("full");
  expect(content.hasAttribute("inert")).toBe(false);
  expect(screen.getByRole("button", { name: "Evidence" })).not.toBeNull();
});
