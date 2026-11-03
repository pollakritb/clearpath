import { expect, test } from "@playwright/test";

test("station time slider switches measured history, now and CAMS forecast on mobile", async ({
  page,
}) => {
  const anchor = Math.floor(Date.now() / 3600000) * 3600000;
  const times = Array.from({ length: 120 }, (_, i) =>
    new Date(anchor + i * 3600000).toISOString(),
  );
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        latitudes: Array.from({ length: 44 }, (_, i) => 4.4 + i * 0.4),
        longitudes: Array.from({ length: 26 }, (_, i) => 96.4 + i * 0.4),
        valid_times: times,
        retrieved_at: new Date(anchor).toISOString(),
        stale: false,
      },
    }),
  );
  await page.route("**/api/forecast-grid/frames?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const start = Date.parse(q.get("start")!),
      end = Date.parse(q.get("end")!);
    return route.fulfill({
      json: {
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        row_start: 0,
        column_start: 0,
        rows: 44,
        columns: 26,
        frames: times
          .filter((at) => Date.parse(at) >= start && Date.parse(at) <= end)
          .map((at) => ({ valid_at: at, values: Array(1144).fill(31) })),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ย้อนหลัง", exact: true }).click();
  const timeline = page.getByRole("region", {
    name: "ย้อนหลัง / พยากรณ์",
    exact: true,
  });
  const slider = timeline.getByRole("slider", {
    name: "เลือกเวลาตรวจวัดและพยากรณ์",
  });
  await expect(slider).toHaveAttribute("aria-valuetext", "ตอนนี้ · Air4Thai");
  await expect(slider).toHaveAttribute("max", "240");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "ย้อนหลัง 1 ชั่วโมง · Air4Thai",
  );
  await expect(page.locator("main.cp-map")).toHaveAttribute(
    "data-mode",
    "history",
  );
  const markers = page.locator(".cp-marker--station");
  await expect(markers.first()).toBeVisible();
  const markerIndex = await markers.evaluateAll((elements) =>
    elements.findIndex((element) => {
      const bounds = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return top === element || (top !== null && element.contains(top));
    }),
  );
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  await markers.nth(markerIndex).click();
  const pin = page.getByRole("region", {
    name: "รายละเอียดสถานีตรวจวัดทางการ",
    exact: true,
  });
  await expect(pin.locator(".cp-pin-station-meta")).toContainText("รหัสสถานี");
  await expect(
    pin.getByRole("button", { name: "ดูรายละเอียดสถานี" }),
  ).toHaveCount(0);
  await pin
    .getByRole("button", { name: "ดูย้อนหลังและพยากรณ์ของสถานีนี้" })
    .click();
  await expect(slider).toHaveAttribute("aria-valuetext", "ตอนนี้ · Air4Thai");
  await expect(
    timeline.getByRole("region", { name: "สถานีที่ติดตามตามเวลา" }),
  ).toBeVisible();
  await slider.press("ArrowRight");
  await expect(page.locator("main.cp-map")).toHaveAttribute(
    "data-mode",
    "cams",
  );
  await expect(timeline.getByRole("status")).toHaveText("CAMS · ค่าพยากรณ์");
  await expect(timeline.locator(".cp-history-station b")).toHaveText("31");
  await slider.press("ArrowLeft");
  await expect(page.locator("main.cp-map")).toHaveAttribute(
    "data-mode",
    "current",
  );
  await expect(slider).toHaveAttribute("aria-valuetext", "ตอนนี้ · Air4Thai");
  await slider.fill("0");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "ย้อนหลัง 24 ชั่วโมง · Air4Thai",
  );
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await timeline.getByRole("button", { name: "ปิดแถบเวลา" }).click();
  await expect(page.getByText("ค่าฝุ่นปัจจุบัน")).toBeVisible();
});
