import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import HistoryTimeline from "./HistoryTimeline";
afterEach(cleanup);
const ref = Date.parse("2026-11-12T12:00:00Z");
it("preserves gaps and distinguishes 100 from 300 without an invented danger line", () => {
  const { container, getByRole } = render(
    <HistoryTimeline
      status="ready"
      reference={ref}
      points={[
        { recorded_at: "2026-11-12T09:00:00Z", pm25: 100, aqi: null },
        { recorded_at: "2026-11-12T10:00:00Z", pm25: null, aqi: null },
        { recorded_at: "2026-11-12T11:00:00Z", pm25: 300, aqi: null },
      ]}
    />,
  );
  const points = [...container.querySelectorAll("circle")];
  expect(points).toHaveLength(2);
  expect(points[0].getAttribute("cy")).not.toBe(points[1].getAttribute("cy"));
  expect(
    container
      .querySelector('path[fill="none"]')
      ?.getAttribute("d")
      ?.match(/M/g),
  ).toHaveLength(2);
  expect(container.textContent).not.toContain("เส้นอันตราย");
  expect(container.textContent).not.toContain("ตอนนี้");
  fireEvent.change(getByRole("slider"), { target: { value: "21" } });
  expect(getByRole("slider").getAttribute("aria-valuetext")).toContain(
    "ไม่มีข้อมูล",
  );
});
