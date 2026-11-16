import { expect, test } from "@playwright/test";

test("existing browser location permission enables alerts without a second consent checkbox", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14, longitude: 100, accuracy: 10 });
  const initial = await page.request.get("/api/notifications/preferences");
  const seeded = await page.request.put("/api/notifications/preferences", {
    data: {
      ...(await initial.json()),
      consent_granted: false,
      air_alerts: true,
    },
  });
  expect(seeded.ok()).toBe(true);
  await page.goto("/settings/notifications");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/notifications/preferences")
          ).json()
        ).consent_granted,
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/notifications/location")).json())
          .status,
    )
    .toBe("ready");
  await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
  await expect(page.getByRole("checkbox", { name: /ยินยอม/ })).toHaveCount(0);
  await expect(page.getByText(/ลบ token/)).toHaveCount(0);
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
