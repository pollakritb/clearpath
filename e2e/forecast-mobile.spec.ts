import { expect, test } from "@playwright/test";

test("forecast card exposes all horizons, uncertainty and accessible table", async ({
  page,
}) => {
  await page.goto("/air?station=81t");
  await expect(
    page.getByText("อากาศวันนี้", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /พยากรณ์/ }).first(),
  ).toBeVisible();

  const selector = page.getByRole("group", { name: /ช่วงเวลาพยากรณ์/ }).first();
  for (const label of ["1 ชม.", "3 ชม.", "6 ชม.", "12 ชม.", "24 ชม."]) {
    await expect(selector.getByRole("button", { name: label })).toBeVisible();
  }
  const sizes = await selector.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }

  await selector.getByRole("button", { name: "24 ชม." }).click();
  await page.getByText("ดูค่าทุกช่วงเวลาแบบตาราง").click();
  await expect(page.getByRole("table", { name: /พยากรณ์/ })).toBeVisible();
  await expect(page.getByText(/ไม่ใช่คำแนะนำทางการแพทย์/)).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("map forecast horizon selector is touch-safe and reports coverage", async ({
  page,
}) => {
  await page.goto("/");
  const selector = page.getByRole("group", { name: /ช่วงเวลาบนแผนที่/ });
  await expect(selector).toBeVisible();
  await selector.getByRole("button", { name: "+12ชม." }).click();
  const sizes = await selector
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  expect(sizes.every((height) => height >= 44)).toBe(true);
  await expect(
    page.getByRole("heading", { name: "พยากรณ์นครปฐมอีก 12 ชั่วโมง" }),
  ).toBeVisible();
  await expect(
    page.getByText(/บางพื้นที่มีสถานีน้อย|ข้อมูลพยากรณ์|กำลังคำนวณ/).first(),
  ).toBeVisible();
});
