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

test("station popup contains metadata and returns from its own history without changing tabs", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  const pin = page.getByRole("region", {
    name: "รายละเอียดสถานีตรวจวัดทางการ",
  });
  await expect(pin.getByText("18.5", { exact: true })).toBeVisible();
  await expect(
    pin.getByRole("heading", { name: "อ่านค่าฝุ่นนี้อย่างไร" }),
  ).toHaveCount(0);
  await pin.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }).press("End");
  await expect(
    pin.getByRole("heading", { name: "อ่านค่าฝุ่นนี้อย่างไร" }),
  ).toBeVisible();
  await pin.getByText(/รหัสสถานี 103t/).scrollIntoViewIfNeeded();
  await expect(pin.getByText(/รหัสสถานี 103t/)).toBeVisible();
  await expect(pin.locator("time")).toHaveAttribute(
    "datetime",
    station.recorded_at,
  );
  await expect(
    pin.getByRole("button", { name: "ดูรายละเอียดสถานี" }),
  ).toHaveCount(0);
  await pin.getByRole("button", { name: "ดูย้อนหลังของสถานีนี้" }).click();
  const history = page.getByRole("region", {
    name: "ค่าตรวจวัดย้อนหลัง",
    exact: true,
  });
  await expect(history.locator("time")).toHaveAttribute(
    "datetime",
    station.recorded_at,
  );
  await history.getByRole("button", { name: "กลับไปที่หมุดสถานี" }).click();
  await expect(pin).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("full station sheet exposes source context and returns to the unchanged summary", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  const pin = page.getByRole("region", {
    name: "รายละเอียดสถานีตรวจวัดทางการ",
  });
  const grip = pin.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  await grip.press("End");
  await expect(pin.getByText("ระดับของค่าที่บันทึก: ดี")).toBeVisible();
  const source = pin.getByRole("link", { name: /ดูข้อมูลจาก Air4Thai/ });
  await source.scrollIntoViewIfNeeded();
  await expect(source).toBeInViewport();
  await expect(source).toHaveAttribute("href", "https://air4thai.pcd.go.th/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/station-full-${page.viewportSize()?.width}.png`,
  });
  await grip.press("Home");
  await expect(
    pin.getByRole("heading", { name: "ที่มาและข้อควรรู้" }),
  ).toHaveCount(0);
  await expect(pin.getByText("18.5", { exact: true })).toBeVisible();
  await pin.getByRole("button", { name: "ปิดรายละเอียดจุดบนแผนที่" }).click();
  await expect(pin).toHaveCount(0);
});

test("station forecast shows missing data without inventing a reading or showing a grid", async ({
  page,
}) => {
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        generation_id: null,
        valid_times: [],
        latitudes: [],
        longitudes: [],
        stale: true,
      },
    }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ดูพยากรณ์ของสถานีนี้" }).click();
  const forecast = page.getByRole("region", {
    name: "พยากรณ์ค่าฝุ่น",
    exact: true,
  });
  await expect(
    forecast.getByText("ไม่มีข้อมูลพยากรณ์ในเวลาที่เลือก"),
  ).toBeVisible();
  await expect(forecast.locator(".cp-history-station b")).toHaveText("—");
  await expect(page.locator(".cp-cams-canvas")).toHaveCount(0);
  await forecast.getByRole("button", { name: "กลับไปที่หมุดสถานี" }).click();
  await expect(
    page.getByRole("region", { name: "รายละเอียดสถานีตรวจวัดทางการ" }),
  ).toBeVisible();
});

test("expired observations stay visibly expired when opening history at now", async ({
  page,
}) => {
  const recordedAt = new Date(Date.now() - 8 * 3600000).toISOString();
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        count: 1,
        updated_at: new Date().toISOString(),
        fresh_count: 0,
        delayed_count: 0,
        expired_count: 1,
        stations: [
          {
            ...station,
            recorded_at: recordedAt,
            data_status: "expired",
            age_minutes: 480,
            eligible_for_surface: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "เวลาซิงก์ข้อมูล" }),
  ).toBeVisible();
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ดูย้อนหลังของสถานีนี้" }).click();
  const history = page.getByRole("region", {
    name: "ค่าตรวจวัดย้อนหลัง",
    exact: true,
  });
  await expect(history.getByText(/ข้อมูลหมดอายุ/)).toBeVisible();
  await expect(history.locator("time")).toHaveAttribute("datetime", recordedAt);
});
