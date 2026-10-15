import { expect, test } from "@playwright/test";

const station = {
  id: "103t",
  name_th: "สถานีตัวอย่าง 103t",
  name_en: null,
  lat: 12.577835,
  lon: 99.953663,
  province: "ประจวบคีรีขันธ์",
  pm25: 18.5,
  aqi: null,
  color: null,
  level: null,
  recorded_at: new Date().toISOString(),
  data_status: "fresh",
  age_minutes: 5,
  eligible_for_surface: true,
  in_service_area: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        count: 1,
        updated_at: station.recorded_at,
        fresh_count: 1,
        delayed_count: 0,
        expired_count: 0,
        stations: [station],
      },
    }),
  );
});

test("station detail shows current reading, hourly CAMS and attribution", async ({
  page,
}) => {
  const fetchedAt = new Date().toISOString();
  const points = Array.from({ length: 8 }, (_, index) => {
    const validAt = new Date(
      Date.now() + (index + 1) * 3_600_000,
    ).toISOString();
    return {
      valid_at: validAt,
      forecast_at: validAt,
      pm25: 20 + index,
      source: "openmeteo_cams",
    };
  });
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({
      json: {
        station_id: station.id,
        target_kind: "station",
        forecast_status: "available",
        fetched_at: fetchedAt,
        points,
      },
    }),
  );

  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  const card = page.getByRole("region", {
    name: "รายละเอียดสถานีตรวจวัดทางการ",
  });
  await expect(card).toHaveAttribute("data-expanded", "false");
  await expect(card.getByText("18.5")).toBeVisible();
  await card.getByRole("button", { name: "ดูรายละเอียดสถานี" }).click();
  await expect(card).toHaveAttribute("data-expanded", "true");

  const forecast = card.getByRole("region", {
    name: "พยากรณ์ PM2.5 รายชั่วโมง",
  });
  await expect(forecast.getByText("20", { exact: true })).toBeVisible();
  await expect(forecast.getByText("CAMS / Open-Meteo").first()).toBeVisible();
  await expect(forecast.getByText(/ดึงข้อมูล/)).toBeVisible();
  await expect(
    card.getByRole("region", { name: "ที่มาข้อมูลสถานี" }),
  ).toBeVisible();
  await expect(card.getByText("กรมควบคุมมลพิษ").first()).toBeVisible();

  await forecast.getByRole("button", { name: "ดูครบ 8 ชั่วโมง" }).click();
  await expect(
    forecast
      .getByRole("group", { name: "เลือกชั่วโมงพยากรณ์" })
      .getByRole("button"),
  ).toHaveCount(8);
  await forecast.getByRole("button", { name: /PM2\.5 21 ไมโครกรัม/ }).click();
  await expect(forecast.getByText("21", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: "test-results/station-detail-mobile.png" });
});

test("station detail never invents forecast when provider is unavailable", async ({
  page,
}) => {
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({
      json: {
        station_id: station.id,
        target_kind: "station",
        forecast_status: "unavailable",
        fetched_at: null,
        points: [],
      },
    }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ดูรายละเอียดสถานี" }).click();
  const forecast = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 รายชั่วโมง",
  });
  await expect(
    forecast.getByText("ยังไม่มีพยากรณ์สำหรับสถานีนี้"),
  ).toBeVisible();
  await expect(forecast.getByText("0", { exact: true })).toHaveCount(0);
});
