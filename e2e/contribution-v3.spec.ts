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

test("v3 reporting sends outdoor context and fresh bonus GPS without a prior help claim", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera", "geolocation"]);
  await context.setGeolocation({
    latitude: 13.8199,
    longitude: 100.0622,
    accuracy: 10,
  });
  await page.route("**/api/community/me/xp", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), policy_version: "contribution-v3" },
    });
  });
  await page.route("**/api/community/report-drafts", (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: "v3-context",
        ocr_pm25: 23.4,
        ocr_status: "ready",
        captured_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 900000).toISOString(),
      },
    }),
  );
  const reward = {
    status: "granted",
    report_xp: 10,
    help_xp: 5,
    first_day_xp: 5,
    week_xp: 0,
    reason: null,
    bonus_reason: "ช่วยเติมพื้นที่ขาดข้อมูล",
    policy_version: "contribution-v3",
  };
  await page.route(
    "**/api/community/report-drafts/v3-context/submit",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.measurement_environment).toBe("outdoor");
      expect(body.near_emission_source).toBe(false);
      expect(body.bonus_gps).toEqual({
        lat: 13.8199,
        lon: 100.0622,
        accuracy_m: 10,
      });
      expect(body.measurement_request_id).toBeUndefined();
      await route.fulfill({
        status: 201,
        json: {
          report: { id: "RPT-v3-context", verified_pm25: 23.4 },
          review_outcome: "automatic_approved",
          review_reasons: [],
          message: "เผยแพร่แล้ว",
          xp: reward,
        },
      });
    },
  );
  await page.route("**/api/community/me/reports/RPT-v3-context/xp", (route) =>
    route.fulfill({ json: reward }),
  );
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(
    page.getByText("กล้องหลังพร้อมแล้ว ถือเครื่องให้นิ่ง", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" }).click();
  await page
    .getByRole("combobox", { name: "บริเวณที่วัด", exact: true })
    .selectOption("outdoor");
  await page.getByRole("button", { name: "ส่งรายงาน", exact: true }).click();
  await expect(
    page.getByText("ได้รับ +20 คะแนน", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/ภารกิจพื้นที่ \+5/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: `output/playwright/v3-context-audit-${page.viewportSize()!.width}.png`,
  });
});
