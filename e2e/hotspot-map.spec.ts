import { expect, test } from "@playwright/test";

// Deliberately coincident detections exercise the maximum-zoom fallback.
// HTTP fixtures never call NASA or mutate real account data.
test("hotspot groups zoom to coincident detections, expose a long list and select a point", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const acquiredAt = new Date(Date.now() - 60 * 60_000).toISOString();
  await page.route("**/api/firms?*", (route) =>
    route.fulfill({
      json: {
        fires: Array.from({ length: 15 }, (_, index) => ({
          id: `hotspot-qa-${index}`,
          lat: 13.82,
          lon: 100.06,
          frp: index + 1,
          bright: 330,
          confidence: "n",
          daynight: "D",
          satellite: "VIIRS_NOAA20_NRT",
          source_products: ["VIIRS_NOAA20_NRT"],
          acquired_at: acquiredAt,
          acq_date: acquiredAt.slice(0, 10),
        })),
        count: 15,
        available: true,
        status: "available",
        checked_at: new Date().toISOString(),
        latest_acquired_at: acquiredAt,
        max_age_hours: 12,
        source: "nasa_firms",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
    .click();
  await page
    .getByRole("switch", { name: /จุดความร้อน(?:จาก)?ดาวเทียม/ })
    .click();
  await page
    .getByRole("switch", { name: /สถานีตรวจวัดทางการ Air4Thai/ })
    .click();
  await page.getByRole("button", { name: "ปิดตัวเลือกข้อมูล" }).click();
  const cluster = page.locator('[title^="กลุ่มจุดความร้อนจากดาวเทียม"]');
  await expect(cluster).toHaveCount(1);
  await expect(cluster).toContainText("15");
  const list = page.getByRole("region", {
    name: "กลุ่มจุดความร้อนจากดาวเทียม",
    exact: true,
  });
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = Number(
      await page.locator(".cp-mapctrls").getAttribute("data-zoom"),
    );
    await cluster.focus();
    await page.keyboard.press(attempt % 2 ? "Space" : "Enter");
    await expect
      .poll(
        async () =>
          (await list.count()) > 0 ||
          Number(await page.locator(".cp-mapctrls").getAttribute("data-zoom")) >
            before,
      )
      .toBe(true);
    if (await list.count()) break;
  }
  await expect(list).toHaveAttribute("data-snap", "peek");
  const grip = list.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  await grip.press("End");
  await expect(list).toHaveAttribute("data-snap", "full");
  await list.getByRole("button", { name: /FRP 15 MW/ }).click();
  const detail = page.getByRole("region", {
    name: "จุดความร้อนจากดาวเทียม",
    exact: true,
  });
  await expect(detail).toHaveAttribute("data-snap", "fixed");
  await expect(detail.getByText("15 MW", { exact: true })).toBeVisible();
  await expect(detail.getByText("ปกติ", { exact: true })).toBeVisible();
  await expect(detail.locator("time")).toContainText("เวลาไทย");
  await expect(
    detail.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  ).toHaveCount(0);
  await detail.getByRole("button", { name: "ปิดแผงข้อมูล" }).click();
  await expect(detail).toHaveCount(0);
});
