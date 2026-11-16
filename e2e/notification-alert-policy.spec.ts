import { expect, test, type Page } from "./fixtures/test";

// UI tests own their state. Real consent/rate-limit behavior is covered by
// backend API tests; hundreds of pages must not share the demo account's 6/min quota.
async function isolateAlertLocation(page: Page, consentGranted: boolean) {
  const initial = await page.request.get("/api/notifications/preferences");
  expect(initial.ok()).toBe(true);
  const preferences = {
    ...(await initial.json()),
    air_alerts: true,
    consent_granted: consentGranted,
  };
  let location = {
    status: "missing",
    observed_at: null as string | null,
    accuracy_m: null as number | null,
    version: null as string | null,
  };
  await page.route("**/api/notifications/preferences", (route) =>
    route.fulfill({ json: preferences }),
  );
  await page.route("**/api/notifications/location", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      expect(body.accuracy_m).toBeLessThanOrEqual(200);
      expect(Math.abs(Date.now() - Date.parse(body.observed_at))).toBeLessThan(
        5000,
      );
      location = {
        status: "ready",
        observed_at: body.observed_at,
        accuracy_m: body.accuracy_m,
        version: body.observed_at,
      };
      preferences.consent_granted = true;
    }
    await route.fulfill({ json: location });
  });
  return { preferences };
}

test("@stateful-360 moving from A to B automatically flushes the latest GPS when hiding the page", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14, longitude: 100, accuracy: 10 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.watchPosition.bind(
      navigator.geolocation,
    );
    navigator.geolocation.watchPosition = (success, error, options) =>
      original(
        (position) => {
          (
            window as unknown as { gpsLatitudeForTest: number }
          ).gpsLatitudeForTest = position.coords.latitude;
          success(position);
        },
        error,
        options,
      );
  });
  await isolateAlertLocation(page, true);
  const savedA = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/notifications/location" &&
      r.request().method() === "PUT" &&
      r.request().postDataJSON()?.lat === 14,
  );
  await page.goto("/");
  expect((await savedA).ok()).toBe(true);
  const marker = page.locator('[title="ตำแหน่งปัจจุบันของคุณ"]');
  await expect(marker).toHaveCount(1);
  const positionA = await marker.getAttribute("style");
  await context.setGeolocation({
    latitude: 14.1,
    longitude: 100.1,
    accuracy: 10,
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { gpsLatitudeForTest?: number })
        .gpsLatitudeForTest === 14.1,
  );
  await expect.poll(() => marker.getAttribute("style")).not.toBe(positionA);
  const savedB = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/notifications/location" &&
      r.request().method() === "PUT" &&
      r.request().postDataJSON()?.lat === 14.1,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect((await savedB).ok()).toBe(true);
});

test("existing browser location permission enables alerts without a second consent checkbox", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14, longitude: 100, accuracy: 10 });
  const { preferences } = await isolateAlertLocation(page, false);
  await page.goto("/settings/notifications");
  await expect.poll(() => preferences.consent_granted).toBe(true);
  await expect(
    page.getByText("พร้อมใช้ตำแหน่งล่าสุดเพื่อแจ้งเตือน"),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "ตำแหน่งสำหรับแจ้งค่าฝุ่น" })
    .screenshot({
      path: `output/playwright/automatic-gps-status-${page.viewportSize()?.width}.png`,
    });
  await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
  await expect(page.getByRole("checkbox", { name: /ยินยอม/ })).toHaveCount(0);
  await expect(page.getByText(/ลบ token/)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /อัปเดตตำแหน่งแจ้งเตือน|ลบตำแหน่งแจ้งเตือน/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/อัปเดตอัตโนมัติเมื่ออนุญาตตำแหน่ง/),
  ).toBeVisible();
});

test("notification settings fix bands and radius, remove quiet hours and persist independent switches", async ({
  page,
}) => {
  const initial = await page.request.get("/api/notifications/preferences");
  expect(initial.ok()).toBe(true);
  const seeded = await page.request.put("/api/notifications/preferences", {
    data: {
      ...(await initial.json()),
      consent_granted: true,
      line_enabled: true,
      air_alerts: true,
      air_alert_warning: true,
      air_alert_danger: true,
      radius_km: 50,
      pm25_threshold: 500,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
  });
  expect(seeded.ok()).toBe(true);
  expect(await seeded.json()).toMatchObject({
    radius_km: 2,
    pm25_threshold: 37.6,
    quiet_hours_start: null,
    quiet_hours_end: null,
    air_alert_warning: true,
    air_alert_danger: true,
  });
  await page.route("**/api/notifications/line", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        linked: true,
        linked_at: new Date().toISOString(),
        official_account_url: null,
      },
    }),
  );
  let externalTests = 0;
  await page.route("**/api/notifications/line/test", (route) => {
    externalTests++;
    return route.abort();
  });
  await page.goto("/settings/notifications");
  await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(page.getByText("ช่วงไม่รบกวน", { exact: true })).toHaveCount(0);
  const warning = page.getByRole("checkbox", { name: /37.6–75.0/ });
  const danger = page.getByRole("checkbox", { name: /75.1 µg/ });
  await expect(warning).toBeChecked();
  await expect(danger).toBeChecked();
  await warning.uncheck();
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/notifications/preferences" &&
      r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "บันทึกเงื่อนไข" }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
  await expect(warning).not.toBeChecked();
  await expect(danger).toBeChecked();
  await expect(
    page
      .locator(".cp-notification-condition-summary")
      .filter({ hasText: "ระยะค้นหาหมุด" }),
  ).toContainText("2 กม.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(externalTests).toBe(0);
  await danger.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `output/playwright/fixed-air-alerts-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
});
