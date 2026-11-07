import { expect, test } from "@playwright/test";

test("v3 mobile profile separates preserved lifetime XP, shared quota and policy rules", async ({
  page,
}) => {
  await page.route("**/api/community/me/xp", async (route) => {
    const response = await route.fetch();
    const summary = await response.json();
    await route.fulfill({
      json: {
        ...summary,
        lifetime_xp: 180,
        today_reports: 5,
        today_help: 1,
        policy_version: "contribution-v3",
        launched_at: "2026-10-01T00:00:00+07:00",
        week_days: 3,
        month_points: 70,
        month_rank: 1,
        community_trust: null,
      },
    });
  });
  await page.goto("/profile");
  await expect(page.getByText(/รายงาน 5\/5 · โบนัสบริการ 1\/3/)).toBeVisible();
  await expect(page.getByText(/สัปดาห์นี้มีผลงาน 3\/5/)).toBeVisible();
  await page.getByText("กติกาคะแนน", { exact: true }).click();
  await expect(page.getByText(/กิจกรรมสูงสุด 70 คะแนน\/วัน/)).toBeVisible();
  await expect(page.getByText(/โบนัสสัปดาห์อีก 20/)).toBeVisible();
  await expect(page.getByText(/คะแนนสะสมไม่หมดอายุ/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: `output/playwright/contribution-v3-${page.viewportSize()!.width}.png`,
  });
});
