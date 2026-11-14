import { expect, test } from "@playwright/test";

test("map keeps its Leaflet instance, zoom and selected station across tabs", async ({
  page,
}) => {
  await page.goto("/");
  const controls = page.locator(".cp-mapctrls");
  await expect(controls).toHaveAttribute("data-zoom", "6");
  await page.locator(".cp-marker--station").first().click();
  await expect(controls).toHaveAttribute("data-zoom", "15");
  await page.locator(".leaflet-container").evaluate((element) => {
    element.setAttribute("data-map-instance", "original");
  });

  const navigation = page.locator(".cp-mobile-nav");
  await navigation.getByRole("link", { name: "วันนี้" }).click();
  await expect(page).toHaveURL(/\/air$/);
  await expect(page.locator('.cp-app[data-tab="overview"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "เปิดหน้านี้ไม่สำเร็จ" }),
  ).toHaveCount(0);
  await expect(page.locator(".leaflet-container")).toHaveCount(1);
  await navigation.getByRole("link", { name: "แผนที่" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".leaflet-container")).toHaveAttribute(
    "data-map-instance",
    "original",
  );
  await expect(controls).toHaveAttribute("data-zoom", "15");

  const overview = page.getByRole("button", { name: "กลับมุมมองแผนที่กว้าง" });
  const sheet = page.getByRole("region", {
    name: "รายละเอียดสถานีตรวจวัดทางการ",
  });
  await expect
    .poll(async () => {
      const controlBounds = await overview.boundingBox();
      const sheetBounds = await sheet.boundingBox();
      return controlBounds && sheetBounds
        ? controlBounds.y + controlBounds.height <= sheetBounds.y
        : false;
    })
    .toBe(true);
  await overview.click();
  await expect(controls).toHaveAttribute("data-zoom", "6");
  await page.screenshot({ path: "test-results/map-continuity-mobile.png" });
});
