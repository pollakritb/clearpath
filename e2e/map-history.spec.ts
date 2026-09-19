import { expect, test } from "@playwright/test";

test("historical map timeline is usable on mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ย้อนหลัง" })).toBeVisible();

  await page.getByRole("button", { name: "ย้อนหลัง" }).click();
  const historyDock = page.getByRole("region", {
    name: "ดูค่าฝุ่นย้อนหลัง",
  });
  const timeline = historyDock.getByRole("slider", {
    name: "เลือกชั่วโมงย้อนหลัง",
  });
  await expect(timeline).toBeVisible();
  await expect(
    historyDock.getByText(/Air4Thai · ย้อนหลัง 1 ชม\./),
  ).toBeVisible();
  await expect(historyDock.getByText(/\d+ สถานี/)).toBeVisible();

  await timeline.fill("18");
  await expect(
    historyDock.getByText(/Air4Thai · ย้อนหลัง 6 ชม\./),
  ).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  const station = page.getByRole("button", { name: /PM2\.5/ }).first();
  await expect(station).toBeVisible();
  await station.click();
  await expect(page.getByText("ค่าตรวจวัดย้อนหลัง").last()).toBeVisible();

  await page.getByRole("button", { name: "ปิดรายละเอียดจุดบนแผนที่" }).click();
  await page.getByRole("button", { name: "ตอนนี้" }).click();
  await expect(page.getByText("ค่าฝุ่นปัจจุบัน")).toBeVisible();
});
