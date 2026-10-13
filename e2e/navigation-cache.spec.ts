import { expect, test } from "@playwright/test";

test("switching tabs reuses recent public data without reloading it", async ({
  page,
}) => {
  const counts = { pm25: 0, reports: 0, mapPoints: 0, news: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/pm25/current") counts.pm25 += 1;
    if (path === "/api/community/reports") counts.reports += 1;
    if (path === "/api/community/map-points") counts.mapPoints += 1;
    if (path === "/api/community/announcements") counts.news += 1;
  });

  await page.goto("/");
  await expect(page.locator(".cp-map-topbar__count")).toContainText(
    "จุดข้อมูล",
  );
  await expect.poll(() => counts.pm25).toBe(1);
  await expect.poll(() => counts.reports).toBe(1);
  await expect.poll(() => counts.mapPoints).toBe(1);

  const navigation = page.getByRole("navigation", { name: "เมนูหลักบนมือถือ" });
  await navigation.getByRole("link", { name: "วันนี้" }).click();
  await expect(page).toHaveURL(/\/air$/);
  await navigation.getByRole("link", { name: "แผนที่" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".cp-map-topbar__count")).toContainText(
    "จุดข้อมูล",
  );
  expect(counts.pm25).toBe(1);
  expect(counts.reports).toBe(1);
  expect(counts.mapPoints).toBe(1);

  await navigation.getByRole("link", { name: "ข่าวสาร" }).click();
  await expect(
    page.getByRole("heading", { name: "ข่าวสารล่าสุด" }),
  ).toBeVisible();
  await expect.poll(() => counts.news).toBe(1);
  await navigation.getByRole("link", { name: "แผนที่" }).click();
  await navigation.getByRole("link", { name: "ข่าวสาร" }).click();
  await expect(
    page.getByRole("heading", { name: "ข่าวสารล่าสุด" }),
  ).toBeVisible();
  expect(counts.news).toBe(1);
});
