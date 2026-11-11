import { expect, test } from "@playwright/test";
import { buildDemoCommunityReports } from "../frontend/lib/demo-community";

test("demo user report shows evidence and opens its photo in-page", async ({
  page,
}) => {
  await page.goto("/?demo=community");
  await page.locator(".cp-marker--individual").first().click();

  const card = page.getByRole("region", {
    name: "รายละเอียดรายงานจากบุคคล",
  });
  await card
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("End");
  await expect(card.getByText("หลักฐานและการตรวจวัด")).toBeVisible();
  await card
    .locator("summary")
    .filter({ hasText: "ข้อมูลเครื่องวัดและการตรวจข้อมูล" })
    .click();
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

test("an archived report link opens its own pin without returning it to the current feed", async ({
  page,
}) => {
  const report = {
    ...buildDemoCommunityReports()[0],
    id: "RPT-000004",
    is_fresh: false,
    age_minutes: 1440,
    captured_at: new Date(Date.now() - 86400000).toISOString(),
  };
  await page.route("**/api/community/reports", (route) =>
    route.fulfill({ json: { reports: [], stacks: [], count: 0 } }),
  );
  await page.route("**/api/community/reports/RPT-000004*", (route) =>
    route.fulfill({ json: report }),
  );
  await page.goto("/?report=RPT-000004&report_request=REQ-000001");
  const card = page.getByRole("region", { name: "รายละเอียดรายงานจากบุคคล" });
  await expect(card).toBeVisible();
  await expect(card.getByText("ข้อมูลก่อนหน้า", { exact: true })).toBeVisible();
  await expect(page.locator(".cp-marker--individual")).toHaveCount(1);
  await card.getByRole("button", { name: "ปิดรายละเอียดจุดบนแผนที่" }).click();
  await expect(page.locator(".cp-marker--individual")).toHaveCount(0);
});

test("a missing report link explains the failure and provides retry", async ({
  page,
}) => {
  await page.route("**/api/community/reports/RPT-000004*", (route) =>
    route.fulfill({
      status: 404,
      json: { detail: "ไม่พบรายงานที่เผยแพร่แล้ว" },
    }),
  );
  await page.goto("/?report=RPT-000004");
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "ไม่พบรายงานที่เผยแพร่แล้ว" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "ลองใหม่" })).toBeVisible();
});
