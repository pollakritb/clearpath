import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MapRequestPanel from "./MapRequestPanel";
import type { LocationSuggestion } from "@/frontend/types";

vi.mock("./CreateRequest", () => ({
  default: ({
    place,
    initiallyOpen,
  }: {
    place: LocationSuggestion;
    initiallyOpen: boolean;
  }) => (
    <div data-testid="request-form" data-open={initiallyOpen}>
      {place.lat},{place.lon}
    </div>
  ),
}));
afterEach(cleanup);

it("requires a map point before confirming and allows cancelling selection", () => {
  const onClose = vi.fn();
  render(
    <MapRequestPanel
      point={null}
      editing={false}
      onClose={onClose}
      onConfirm={vi.fn()}
      onReselect={vi.fn()}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByTestId("request-form")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "ปิดการขอค่าฝุ่น" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("confirms the selected coordinates before opening the form and supports reselecting", () => {
  const point = {
    id: "point",
    name: "จุดที่เลือกบนแผนที่",
    lat: 13.8,
    lon: 100.1,
  } as LocationSuggestion;
  const onConfirm = vi.fn();
  const onReselect = vi.fn();
  const props = { point, onConfirm, onReselect, onClose: vi.fn() };
  const { rerender } = render(<MapRequestPanel {...props} editing={false} />);
  expect(screen.getByText("13.80000, 100.10000")).toBeTruthy();
  expect(screen.queryByTestId("request-form")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }),
  );
  expect(onConfirm).toHaveBeenCalledOnce();
  rerender(<MapRequestPanel {...props} editing />);
  expect(screen.getByTestId("request-form").textContent).toBe("13.8,100.1");
  expect(screen.getByTestId("request-form").getAttribute("data-open")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนจุดบนแผนที่" }));
  expect(onReselect).toHaveBeenCalledOnce();
});
