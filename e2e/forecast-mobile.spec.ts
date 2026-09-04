import { expect, test } from "@playwright/test";

function externalForecastFixture() {
  const generatedAt = "2026-09-04T03:00:00+00:00";
  const points = Array.from({ length: 24 }, (_, index) => {
    const horizon = index + 1;
    return {
      horizon_hours: horizon,
      forecast_at: new Date(
        Date.parse(generatedAt) + horizon * 60 * 60 * 1000,
      ).toISOString(),
      pm25: 20 + horizon,
      lower: 15 + horizon,
      upper: 28 + horizon,
      method: "external-provider-selection-v1",
      model_version: null,
      feature_version: null,
      artifact_sha256: null,
      coverage_target: 0.8,
      calibration_version: "provider-spread-envelope-v1",
      agreement: "high",
      provider_count: 2,
      source: "openmeteo_cams",
    };
  });
  return {
    station_id: "81t",
    generated_at: generatedAt,
    source_recorded_at: null,
    horizon_hours: 24,
    method: "external-provider-selection-v1",
    source_points: 0,
    model_version: null,
    feature_version: null,
    artifact_sha256: null,
    coverage_target: 0.8,
    data_quality: "limited",
    quality: {
      status: "limited",
      ml_eligible: false,
      reason_codes: ["pm25_history_missing"],
      warnings: [],
      source_recorded_at: null,
      input_freshness_minutes: null,
      source_points: 0,
      recent_required_points: 0,
      missing_hours: 0,
      duplicate_hours: 0,
      optional_feature_completeness: 0,
      optional_feature_states: {},
    },
    fallback_reason: "pm25_history_missing",
    fallback_reason_codes: ["pm25_history_missing"],
    warnings: [],
    points,
    forecast_status: "available",
    limitation_reason_codes: [],
    unavailable_reason_codes: [],
    agreement: "high",
    provider_count: 2,
    sources: points.flatMap((point) => [
      {
        source: "openmeteo_cams",
        horizon_hours: point.horizon_hours,
        forecast_at: point.forecast_at,
        pm25: point.pm25,
        lower: null,
        upper: null,
        weight: 1,
        available: true,
        issued_at: generatedAt,
      },
      {
        source: "openweather",
        horizon_hours: point.horizon_hours,
        forecast_at: point.forecast_at,
        pm25: point.pm25 + 2,
        lower: null,
        upper: null,
        weight: 1,
        available: true,
        issued_at: generatedAt,
      },
    ]),
    forecast_mode: "external_provider",
    recommended_source: "openmeteo_cams",
    providers: [
      {
        source: "gistda",
        label: "GISTDA เช็คฝุ่น",
        attribution: "GISTDA",
        attribution_url: "https://pm25.gistda.or.th/",
        available: false,
        selected: false,
        latest_issued_at: null,
        freshness_status: "unavailable",
        coverage_hours: 0,
        maximum_horizon_hours: 3,
        stale_after_hours: 5,
        usage_note: "แบบจำลองเช็คฝุ่นสำหรับตำแหน่งในประเทศไทย",
      },
      {
        source: "openmeteo_cams",
        label: "CAMS / Open-Meteo",
        attribution: "CAMS ENSEMBLE via Open-Meteo",
        attribution_url: "https://open-meteo.com/en/docs/air-quality-api",
        available: true,
        selected: true,
        latest_issued_at: generatedAt,
        freshness_status: "fresh",
        coverage_hours: 24,
        maximum_horizon_hours: 120,
        stale_after_hours: 14,
        usage_note: "แบบจำลองบรรยากาศระดับภูมิภาค ไม่ใช่เครื่องวัด ณ จุดนั้น",
      },
      {
        source: "openweather",
        label: "OpenWeather Air Pollution",
        attribution: "OpenWeather",
        attribution_url: "https://openweathermap.org/api/air-pollution",
        available: true,
        selected: false,
        latest_issued_at: generatedAt,
        freshness_status: "fresh",
        coverage_hours: 24,
        maximum_horizon_hours: 96,
        stale_after_hours: 10,
        usage_note: "แบบจำลองคุณภาพอากาศรายชั่วโมงตามพิกัด",
      },
    ],
    community_context: {
      mode: "context_only",
      affects_recommendation: false,
      eligible_report_count: 2,
      nearby_report_count: 2,
      effective_sample_size: 1.8,
      residual_pm25: 3.2,
      trust_threshold: 60,
      radius_km: 5,
      policy: "approved-fresh-trust-corroborated-v1",
    },
    provenance: {},
  };
}

test("forecast card exposes all horizons, uncertainty and accessible table", async ({
  page,
}) => {
  await page.goto("/air?station=81t");
  await expect(
    page.getByText("อากาศวันนี้", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PM2.5 ในพื้นที่นี้" }).first(),
  ).toBeVisible();

  const selector = page.getByRole("group", { name: /ช่วงเวลาพยากรณ์/ }).first();
  for (const label of ["1 ชม.", "3 ชม.", "6 ชม.", "12 ชม.", "24 ชม."]) {
    await expect(selector.getByRole("button", { name: label })).toBeVisible();
  }
  const sizes = await selector.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }

  await selector.getByRole("button", { name: "24 ชม." }).click();
  await page.getByText("เปรียบเทียบแหล่งข้อมูล").click();
  await expect(page.getByText("GISTDA เช็คฝุ่น")).toBeVisible();
  await expect(page.getByText("ข้อมูลยืนยันจากชุมชน")).toBeVisible();
  await page.getByText("ดูค่าที่แนะนำทุกช่วงเวลา").click();
  await expect(page.getByRole("table", { name: /พยากรณ์/ })).toBeVisible();
  await expect(page.getByText(/ไม่ใช่คำแนะนำทางการแพทย์/)).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("map forecast horizon selector is touch-safe and reports coverage", async ({
  page,
}) => {
  await page.goto("/");
  const selector = page.getByRole("group", { name: /ช่วงเวลาบนแผนที่/ });
  await expect(selector).toBeVisible();
  await selector.getByRole("button", { name: "+12ชม." }).click();
  const sizes = await selector
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  expect(sizes.every((height) => height >= 44)).toBe(true);
  await expect(
    page.getByText("พยากรณ์ประเทศไทยอีก 12 ชั่วโมง", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cp-map-forecast-chip")).toBeVisible();
});

test("external provider comparison keeps raw values separate on mobile", async ({
  page,
}) => {
  await page.route("**/api/forecast?**", async (route) => {
    await route.fulfill({ json: externalForecastFixture() });
  });
  await page.goto("/air?station=81t");
  await expect(
    page.getByText("ค่าที่ระบบแนะนำ", { exact: true }),
  ).toBeVisible();
  await page.getByText("เปรียบเทียบแหล่งข้อมูล").click();
  await expect(
    page.getByRole("button", { name: /CAMS \/ Open-Meteo/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /OpenWeather/ }).click();
  await expect(page.getByText("กำลังดูแหล่งนี้")).toBeVisible();
  await expect(page.getByText("ไม่ได้เฉลี่ยกับแหล่งอื่น")).toBeVisible();
  await expect(page.getByText(/พบ 2 รายงานที่ผ่านเกณฑ์/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});
