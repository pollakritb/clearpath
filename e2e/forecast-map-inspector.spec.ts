import { expect, test } from "@playwright/test";

const station = {
  id: "103t",
  name_th: "สถานี 103t",
  name_en: null,
  lat: 12.577835,
  lon: 99.953663,
  province: "ประจวบคีรีขันธ์",
  pm25: 18.5,
  aqi: null,
  color: null,
  level: null,
  recorded_at: "2026-10-15T10:00:00+07:00",
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

function mockForecast(
  requestedLat: number,
  requestedLon: number,
  grid: boolean,
) {
  const fetched = "2026-10-15T17:20:00Z";
  return {
    station_id: "103t",
    target_kind: "station",
    requested_lat: requestedLat,
    requested_lon: requestedLon,
    grid_lat: grid ? 12.599998 : null,
    grid_lon: grid ? 100.0 : null,
    fetched_at: fetched,
    generated_at: fetched,
    points: [
      {
        valid_at: "2026-10-15T18:00:00Z",
        forecast_at: "2026-10-15T18:00:00Z",
        pm25: 21.4,
      },
    ],
  };
}

test("103t inspector labels requested/grid, time and missing grid on mobile", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  let missingGrid = false;
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({
      json: mockForecast(station.lat, station.lon, !missingGrid),
    }),
  );
  await page.route("**/api/forecast/validation-summary?*", (route) =>
    route.fulfill({
      json: {
        available: false,
        reason: "not_evaluated",
        station_id: "103t",
        sample_count: 0,
      },
    }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  const inspector = page.getByRole("region", { name: "ตรวจพิกัดพยากรณ์" });
  await expect(inspector.getByText(/Grid CAMS/)).toBeVisible();
  await expect(inspector.getByText(/ไม่ใช่คะแนนความแม่นยำ/)).toBeVisible();
  await expect(inspector.getByText(/ยังไม่มีผลประเมิน/)).toBeVisible();
  await expect(page.locator(".cp-forecast-marker__requested")).toHaveCount(1);
  await expect(page.locator(".cp-forecast-marker__grid")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/cams-inspector-103t-mobile.png",
  });

  await inspector.getByRole("button", { name: "ปิดการตรวจพิกัด" }).click();
  missingGrid = true;
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(inspector.getByText(/ไม่มีพิกัด/)).toBeVisible();
  await expect(page.locator(".cp-forecast-marker__grid")).toHaveCount(0);
});

test("103t inspector fits desktop viewport without horizontal overflow", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({ json: mockForecast(station.lat, station.lon, true) }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(page.locator(".cp-forecast-marker__grid")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/cams-inspector-103t-desktop.png",
  });
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});

test("coincident requested and grid coordinates use one combined marker", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({
      json: {
        ...mockForecast(station.lat, station.lon, true),
        grid_lat: station.lat,
        grid_lon: station.lon,
      },
    }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(page.locator(".cp-forecast-marker__overlap")).toHaveCount(1);
  await expect(page.locator(".cp-forecast-marker__grid")).toHaveCount(0);
});

test("searched place uses rounded area coordinates", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  let requestUrl = "";
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        coverage: "nationwide",
        locations: [
          {
            id: "osm:place",
            name: "สถานที่ทดสอบ",
            address: "นครปฐม",
            kind: "amenity",
            source: "openstreetmap",
            lat: 13.8199,
            lon: 100.0622,
          },
        ],
      },
    }),
  );
  await page.route("**/api/forecast?*", (route) => {
    requestUrl = route.request().url();
    return route.fulfill({ json: mockForecast(13.82, 100.06, true) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(
    page
      .getByRole("region", { name: "ตรวจพิกัดพยากรณ์" })
      .getByText(/13\.8200, 100\.0600/),
  ).toBeVisible();
  expect(requestUrl).toContain("lat=13.82");
  expect(requestUrl).toContain("lon=100.06");
  expect(requestUrl).not.toContain("station_id=");
});

test("switching from a station to a place does not reuse station forecast", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  const requests: string[] = [];
  await page.route("**/api/forecast?*", (route) => {
    requests.push(route.request().url());
    const isStation = route.request().url().includes("station_id=103t");
    return route.fulfill({
      json: {
        ...mockForecast(
          isStation ? station.lat : 13.82,
          isStation ? station.lon : 100.06,
          true,
        ),
        station_id: isStation ? "103t" : null,
        target_kind: isStation ? "station" : "area",
      },
    });
  });
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        coverage: "nationwide",
        locations: [
          {
            id: "osm:place",
            name: "สถานที่ทดสอบ",
            address: "นครปฐม",
            kind: "amenity",
            source: "openstreetmap",
            lat: 13.8199,
            lon: 100.0622,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  const inspector = page.getByRole("region", { name: "ตรวจพิกัดพยากรณ์" });
  await expect(inspector.getByText(/12\.5778, 99\.9537/)).toBeVisible();
  await inspector.getByRole("button", { name: "ปิดการตรวจพิกัด" }).click();
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(inspector.getByText(/13\.8200, 100\.0600/)).toBeVisible();
  expect(requests.some((url) => url.includes("station_id=103t"))).toBe(true);
  expect(requests.some((url) => url.includes("lat=13.82"))).toBe(true);
});

test("GPS forecast rounds submitted coordinates and handles provider failure", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  if (testInfo.project.name !== "mobile-390") test.skip();
  await context.grantPermissions(["geolocation"], {
    origin: new URL(baseURL!).origin,
  });
  await context.setGeolocation({ latitude: 13.81999, longitude: 100.06223 });
  let requestUrl = "";
  await page.route("**/api/forecast?*", (route) => {
    requestUrl = route.request().url();
    return route.fulfill({
      status: 502,
      json: { detail: "provider_unavailable" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  await expect(
    page.getByRole("region", { name: "ตรวจพิกัดพยากรณ์" }).getByRole("alert"),
  ).toBeVisible();
  expect(requestUrl).toContain("lat=13.82");
  expect(requestUrl).toContain("lon=100.06");
  expect(requestUrl).not.toContain("13.81999");
});

test("optional live CAMS screenshot for 103t", async ({ page }, testInfo) => {
  if (
    testInfo.project.name !== "mobile-390" ||
    !process.env.CLEARPATH_LIVE_CAMS_SCREENSHOT
  )
    test.skip();
  await page.goto("/");
  await page.locator(".cp-marker--station").first().click();
  await page.getByRole("button", { name: "ตรวจพิกัดพยากรณ์" }).click();
  const inspector = page.getByRole("region", { name: "ตรวจพิกัดพยากรณ์" });
  await expect(inspector.getByText(/Grid CAMS/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(inspector.getByText(/24\/24 ชั่วโมง/)).toBeVisible();
  await page.screenshot({
    path: "test-results/cams-inspector-103t-live-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: "test-results/cams-inspector-103t-live-desktop.png",
  });
});
