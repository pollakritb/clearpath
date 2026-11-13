import { expect, test } from "@playwright/test";

test("my reports uses primary navigation for new reports without a duplicate header action", async ({
  page,
}) => {
  await page.goto("/profile?tab=reports");
  const reports = page.getByRole("region", {
    name: "รายงานของฉัน",
    exact: true,
  });
  await expect(
    reports.getByRole("heading", { name: "รายงานล่าสุด", exact: true }),
  ).toBeVisible();
  await expect(
    reports.getByRole("link", { name: "ส่งรายงาน", exact: true }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "เมนูหลักบนมือถือ" });
  await nav.getByRole("link", { name: "ส่งรายงาน", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(
    page.getByRole("heading", { name: "ส่งรายงานค่าฝุ่น", exact: true }),
  ).toBeVisible();
});

test("admin overview uses the report card and navigation without a second adjacent report button", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "ภาพรวม ClearPath", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "เปิดประวัติรายงาน", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: /รายงานล่าสุด.*ดูภาพและผลตรวจอัตโนมัติย้อนหลัง/,
    })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "ประวัติรายงานจากผู้ใช้", exact: true })
      .first(),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "เมนูผู้ดูแล" });
  await nav.getByRole("button", { name: /ภาพรวม/ }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวม ClearPath", exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: /รายงาน/ }).click();
  await expect(
    page
      .getByRole("heading", { name: "ประวัติรายงานจากผู้ใช้", exact: true })
      .first(),
  ).toBeVisible();
});
