import { expect, test } from "@playwright/test";

test("CAMS keeps playback compact and moves supporting information into the expanded panel", async ({
  page,
}) => {
  const anchor = Math.floor(Date.now() / 3600000) * 3600000;
  const times = Array.from({ length: 100 }, (_, i) =>
    new Date(anchor + i * 3600000).toISOString(),
  );
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        latitudes: [13.6, 14],
        longitudes: [100, 100.4],
        valid_times: times,
        retrieved_at: new Date(anchor).toISOString(),
        stale: false,
      },
    }),
  );
  await page.route("**/api/forecast-grid/frames?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        row_start: 0,
        column_start: 0,
        rows: 2,
        columns: 2,
        frames: times
          .filter(
            (t) =>
              Date.parse(t) >= Date.parse(q.get("start")!) &&
              Date.parse(t) <= Date.parse(q.get("end")!),
          )
          .map((valid_at) => ({ valid_at, values: [20, 20, 20, 20] })),
      },
    });
  });
  await page.goto("/?layer=cams");
  const panel = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 · CAMS",
    exact: true,
  });
  const slider = panel.getByRole("slider", { name: "เลือกเวลาพยากรณ์ CAMS" });
  await expect(slider).toHaveAttribute("max", "99");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-snap", "peek");
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeLessThan(170);
  const selected = panel.locator(".cp-map-history-dock__heading strong");
  expect(await selected.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await expect(
    panel.getByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toHaveCount(0);
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("1");
  const grip = panel.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  await grip.click();
  await expect(panel).toHaveAttribute("data-snap", "full");
  await expect(
    panel.getByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toBeVisible();
  await expect(
    panel.getByLabel("ระดับ PM2.5 หน่วยไมโครกรัมต่อลูกบาศก์เมตร"),
  ).toBeVisible();
  await expect(
    panel.getByText("CAMS · 100 ช่วงเวลาที่เลือกได้", { exact: true }),
  ).toBeVisible();
  await grip.click();
  await expect(panel).toHaveAttribute("data-snap", "peek");
  await expect(slider).toBeVisible();
});
