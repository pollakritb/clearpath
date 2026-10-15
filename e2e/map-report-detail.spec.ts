import { expect, test } from "@playwright/test";

test("demo user report shows evidence and opens its photo in-page", async ({
  page,
}) => {
  await page.goto("/?demo=community");
  await page.locator(".cp-marker--individual").first().click();

  const card = page.getByRole("region", {
    name: "รายละเอียดรายงานจากบุคคล",
  });
  await card
    .getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" })
    .click();
  await expect(card.getByText("หลักฐานและการตรวจวัด")).toBeVisible();
  await expect(card.getByText("ช่วงเวลาของค่า")).toBeVisible();
  await expect(card.getByText("ผู้รายงาน", { exact: true })).toBeVisible();

  const originalPageCount = page.context().pages().length;
  await card
    .getByRole("button", { name: "เปิดดูภาพเครื่องวัดจากรายงานนี้" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "ภาพเครื่องวัดจากรายงานนี้",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", {
      name: "ภาพเครื่องวัด PM2.5 ฉบับเต็มจากผู้รายงาน",
    }),
  ).toBeVisible();
  expect(page.context().pages()).toHaveLength(originalPageCount);
  await page.screenshot({ path: "test-results/report-photo-popup-mobile.png" });

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card.getByText("หลักฐานและการตรวจวัด")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: "test-results/report-detail-mobile.png" });
});
