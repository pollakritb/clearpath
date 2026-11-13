/** Run via check_line_mobile_routes.py / playwright-cli, not against production. */
export default async function checkLineMobileRoutes(controlPage) {
  const start = Number("START_CASE");
  const count = Number("CASE_COUNT");
  const base = "http://127.0.0.1:3117";
  const origins = ["/", "/air", "/community", "/requests"];
  const widths = [320, 375, 390, 430];
  const actions = [
    "edit_cancel",
    "edit_save",
    "update_gps",
    "clear_gps",
    "details",
    "settings_back",
    "reload",
    "line_test",
    "line_disconnect",
    "line_link",
    "toggle_air",
    "quiet_hours",
    "radius",
  ];
  const results = [];
  const browser = controlPage.context().browser();
  let next = start;
  async function worker() {
    const context = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    try {
      while (next < start + count) {
        const id = next++;
        const origin = origins[id % 4];
        const width = widths[Math.floor(id / 4) % 4];
        const code = (id * 137 + 41) % actions.length ** 4;
        const path = Array.from(
          { length: 4 },
          (_, j) =>
            actions[Math.floor(code / actions.length ** j) % actions.length],
        );
        const trace = [];
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        let preferences = {
          line_enabled: true,
          district: null,
          subdistrict: null,
          radius_km: [1, 2, 10, 50][id % 4],
          center_lat: null,
          center_lon: null,
          pm25_threshold: [37.6, 75.1, 100, 500][id % 4],
          air_alerts: true,
          hotspot_alerts: true,
          community_alerts: false,
          report_status_alerts: true,
          rating_alerts: true,
          reward_alerts: true,
          leaderboard_alerts: false,
          announcement_alerts: true,
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: "Asia/Bangkok",
          consent_granted: id % 5 !== 0,
          consent_granted_at: null,
        };
        const gpsMode = ["valid", "denied", "coarse"][id % 3];
        const saveFails = id % 11 === 0;
        const gpsSaveFails = id % 13 === 0;
        const clearFails = id % 17 === 0;
        let failPreferenceReads = id % 19 === 0;
        const initialStatus = ["missing", "ready", "stale"][
          Math.floor(id / 16) % 3
        ];
        let location = {
          status: initialStatus,
          observed_at:
            initialStatus === "missing"
              ? null
              : new Date(
                  Date.now() - (initialStatus === "stale" ? 90000000 : 60000),
                ).toISOString(),
          accuracy_m: initialStatus === "missing" ? null : 10,
          version: initialStatus === "missing" ? null : "fixture-v1",
        };
        let linked = id % 2 === 0;
        let mockLineSends = 0;
        let preferenceWrites = 0;
        let locationWrites = 0;
        let deletes = 0;
        const target = `${base}/settings/notifications?returnTo=${encodeURIComponent(origin)}`;
        const assert = (condition, message) => {
          if (!condition) throw new Error(message);
        };
        try {
          await page.setViewportSize({ width, height: 844 });
          await page.addInitScript(
            ({ mode }) => {
              Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                  writeText: async (text) => {
                    window.__testCopiedCode = text;
                  },
                },
              });
              Object.defineProperty(navigator, "permissions", {
                configurable: true,
                value: { query: async () => ({ state: "prompt" }) },
              });
              Object.defineProperty(navigator, "geolocation", {
                configurable: true,
                value: {
                  getCurrentPosition(success, failure) {
                    setTimeout(
                      () =>
                        mode === "denied"
                          ? failure({ code: 1 })
                          : success({
                              timestamp: Date.now(),
                              coords: {
                                latitude: 14,
                                longitude: 100,
                                accuracy: mode === "coarse" ? 1000 : 10,
                              },
                            }),
                      0,
                    );
                  },
                },
              });
            },
            { mode: gpsMode },
          );
          await page.route(
            "**/api/notifications/preferences",
            async (route) => {
              if (route.request().method() === "PUT") {
                preferenceWrites++;
                if (saveFails)
                  return route.fulfill({
                    status: 503,
                    json: { detail: "fixture save failure" },
                  });
                preferences = route.request().postDataJSON();
                return route.fulfill({ json: preferences });
              }
              return failPreferenceReads
                ? route.fulfill({
                    status: 503,
                    json: { detail: "fixture initial read failure" },
                  })
                : route.fulfill({ json: preferences });
            },
          );
          await page.route("**/api/notifications/location", async (route) => {
            const method = route.request().method();
            if (method === "PUT") {
              locationWrites++;
              if (gpsSaveFails)
                return route.fulfill({
                  status: 503,
                  json: { detail: "fixture GPS save failure" },
                });
              const sample = route.request().postDataJSON();
              assert(
                sample.lat === 14 &&
                  sample.lon === 100 &&
                  sample.accuracy_m === 10,
                "wrong GPS payload",
              );
              assert(
                Date.now() - Date.parse(sample.observed_at) < 60000,
                "GPS sample time lost",
              );
              location = {
                status: "ready",
                observed_at: sample.observed_at,
                accuracy_m: sample.accuracy_m,
                version: `fixture-${locationWrites}`,
              };
            }
            if (method === "DELETE") {
              deletes++;
              if (clearFails)
                return route.fulfill({
                  status: 503,
                  json: { detail: "fixture clear failure" },
                });
              location = {
                status: "missing",
                observed_at: null,
                accuracy_m: null,
                version: null,
              };
              return route.fulfill({
                json: { ok: true, message: "ลบตำแหน่งแจ้งเตือนแล้ว" },
              });
            }
            return route.fulfill({ json: location });
          });
          await page.route("**/api/notifications/line", async (route) => {
            if (route.request().method() === "DELETE") {
              if (id % 37 === 0)
                return route.fulfill({
                  status: 503,
                  json: { detail: "fixture unlink failure" },
                });
              linked = false;
              preferences = { ...preferences, line_enabled: false };
              return route.fulfill({
                json: { ok: true, message: "ยกเลิก LINE แล้ว" },
              });
            }
            return route.fulfill({
              json: {
                enabled: true,
                linked,
                linked_at: linked ? new Date().toISOString() : null,
                official_account_url: null,
              },
            });
          });
          await page.route("**/api/notifications/line/test", (route) => {
            mockLineSends++;
            return id % 29 === 0
              ? route.fulfill({
                  status: 429,
                  json: { detail: "fixture test throttled" },
                })
              : route.fulfill({
                  json: { ok: true, message: "fixture test sent" },
                });
          });
          await page.route("**/api/notifications/line/link-code", (route) =>
            id % 31 === 0
              ? route.fulfill({
                  status: 503,
                  json: { detail: "fixture link code failure" },
                })
              : route.fulfill({
                  json: {
                    code: "CP-ABCD2345",
                    expires_at: new Date(Date.now() + 600000).toISOString(),
                    official_account_url: null,
                    instruction: "fixture only",
                  },
                }),
          );
          await page.route("**/api/measurement-requests/helper", (route) =>
            route.fulfill({
              json: {
                enabled: false,
                registered_locations_enabled: false,
                radius_km: 2,
                location_slots: 2,
                locations: [],
                location_count: 0,
              },
            }),
          );
          await page.goto(target, { waitUntil: "domcontentloaded" });
          if (failPreferenceReads) {
            await page
              .getByRole("button", { name: "ลองโหลดเงื่อนไขใหม่" })
              .waitFor();
            failPreferenceReads = false;
            await page
              .getByRole("button", { name: "ลองโหลดเงื่อนไขใหม่" })
              .click();
            trace.push("initial_read_failure_recovered");
          }
          const panel = () =>
            page.getByRole("region", { name: "ตำแหน่งสำหรับแจ้งค่าฝุ่น" });
          const ready = async () => {
            await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).waitFor();
            await panel().waitFor();
            if (location.observed_at)
              await panel()
                .getByText(/อ่าน GPS เมื่อ/)
                .waitFor();
          };
          await ready();
          for (const action of path) {
            if (action === "edit_cancel") {
              const oldThreshold = preferences.pm25_threshold;
              const before = preferenceWrites;
              await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
              await page.getByRole("slider").first().press("End");
              await page.getByRole("button", { name: "ปิดการแก้ไข" }).click();
              await ready();
              assert(
                preferenceWrites === before &&
                  preferences.pm25_threshold === oldThreshold,
                "cancel persisted draft",
              );
              assert(
                (await page
                  .locator("#notification-condition-editor")
                  .count()) === 0,
                "cancel left editor open",
              );
            } else if (action === "edit_save") {
              await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
              const slider = page.getByRole("slider").first();
              await slider.press("Home");
              for (let j = 0; j < id % 3; j++) await slider.press("ArrowRight");
              const desired = Number(await slider.inputValue());
              await page
                .getByRole("checkbox", { name: /ยินยอมรับแจ้งเตือนและใช้ GPS/ })
                .check();
              await page
                .getByRole("button", { name: "บันทึกเงื่อนไข" })
                .click();
              if (saveFails) {
                await page
                  .getByRole("alert")
                  .filter({ hasText: "บันทึกไม่สำเร็จ" })
                  .waitFor();
                assert(
                  (await page
                    .locator("#notification-condition-editor")
                    .count()) === 1,
                  "failed save discarded editor",
                );
                await page.getByRole("button", { name: "ปิดการแก้ไข" }).click();
              } else {
                await ready();
                assert(
                  preferences.pm25_threshold === desired &&
                    preferences.consent_granted,
                  "successful save lost values",
                );
              }
            } else if (action === "update_gps") {
              const button = panel().getByRole("button", {
                name: "อัปเดตตำแหน่งแจ้งเตือน",
              });
              if (!preferences.consent_granted || !preferences.air_alerts) {
                assert(
                  await button.isDisabled(),
                  "GPS enabled without saved consent",
                );
                trace.push("gps_blocked_without_consent");
              } else {
                const before = locationWrites;
                await button.click();
                if (gpsMode === "denied")
                  await panel()
                    .getByRole("alert")
                    .filter({ hasText: "ยังไม่ได้อนุญาตตำแหน่ง" })
                    .waitFor();
                else if (gpsMode === "coarse")
                  await panel()
                    .getByRole("alert")
                    .filter({ hasText: "ตำแหน่งยังไม่แม่นยำพอ" })
                    .waitFor();
                else if (gpsSaveFails)
                  await panel()
                    .getByRole("alert")
                    .filter({ hasText: "บันทึกตำแหน่งไม่สำเร็จ" })
                    .waitFor();
                else
                  await panel().getByText("พร้อมใช้ค้นหาหมุดใกล้คุณ").waitFor();
                await button.waitFor({ state: "visible" });
                if (gpsMode !== "valid")
                  assert(
                    locationWrites === before,
                    "invalid GPS was persisted",
                  );
              }
            } else if (action === "clear_gps") {
              const button = panel().getByRole("button", {
                name: "ลบตำแหน่งแจ้งเตือน",
              });
              if (await button.count()) {
                await button.click();
                if (clearFails)
                  await panel()
                    .getByRole("alert")
                    .filter({ hasText: "ลบตำแหน่งไม่สำเร็จ" })
                    .waitFor();
                else {
                  await button.waitFor({ state: "hidden" });
                  assert(
                    location.status === "missing",
                    "clear retained saved point",
                  );
                }
              } else
                assert(
                  !location.observed_at,
                  "saved location has no clear control",
                );
            } else if (action === "details") {
              const details = panel().locator("details");
              const wasOpen = await details.evaluate((element) => element.open);
              await details.locator("summary").click();
              assert(
                (await details.evaluate((element) => element.open)) !== wasOpen,
                "details toggle failed",
              );
            } else if (action === "settings_back") {
              await page
                .getByRole("link", { name: "กลับไปการตั้งค่า" })
                .click();
              await page.waitForURL((url) => url.pathname === "/settings");
              assert(
                new URL(page.url()).searchParams.get("returnTo") === origin,
                "back lost origin",
              );
              await page
                .getByRole("link", { name: /การแจ้งเตือน ช่องทาง/ })
                .click();
              await ready();
            } else if (action === "line_test") {
              const line = page.locator(".cp-line-link");
              if (linked) {
                await line
                  .getByRole("button", { name: "ส่งข้อความทดสอบ" })
                  .click();
                if (id % 29 === 0)
                  await line
                    .getByRole("alert")
                    .filter({ hasText: "fixture test throttled" })
                    .waitFor();
                else await line.getByText("fixture test sent").waitFor();
              } else
                assert(
                  (await line
                    .getByRole("button", { name: "ส่งข้อความทดสอบ" })
                    .count()) === 0,
                  "test button enabled without LINE link",
                );
            } else if (action === "line_disconnect") {
              const line = page.locator(".cp-line-link");
              if (linked) {
                await line
                  .getByRole("button", { name: "ยกเลิกการเชื่อม" })
                  .click();
                if (id % 37 === 0)
                  await line
                    .getByRole("alert")
                    .filter({ hasText: "ยกเลิก LINE ไม่สำเร็จ" })
                    .waitFor();
                else
                  await line
                    .getByRole("button", { name: "สร้างรหัสเชื่อมบัญชี" })
                    .waitFor();
              } else
                await line
                  .getByRole("button", { name: "สร้างรหัสเชื่อมบัญชี" })
                  .waitFor();
            } else if (action === "line_link") {
              const line = page.locator(".cp-line-link");
              if (!linked) {
                await line
                  .getByRole("button", { name: "สร้างรหัสเชื่อมบัญชี" })
                  .click();
                if (id % 31 === 0)
                  await line
                    .getByRole("alert")
                    .filter({ hasText: "สร้างรหัส LINE ไม่สำเร็จ" })
                    .waitFor();
                else {
                  await line
                    .getByRole("button", { name: "คัดลอกรหัส", exact: true })
                    .click();
                  await line
                    .getByRole("button", { name: "คัดลอกแล้ว", exact: true })
                    .waitFor();
                  assert(
                    (await page.evaluate(() => window.__testCopiedCode)) ===
                      "CP-ABCD2345",
                    "wrong link code copied",
                  );
                  linked = true;
                  preferences = {
                    ...preferences,
                    line_enabled: true,
                    consent_granted: true,
                  };
                  await line
                    .getByRole("button", { name: "ส่งข้อความทดสอบ" })
                    .waitFor();
                }
              } else
                await line
                  .getByRole("button", { name: "ส่งข้อความทดสอบ" })
                  .waitFor();
            } else if (
              ["toggle_air", "quiet_hours", "radius"].includes(action)
            ) {
              await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
              let expected;
              if (action === "toggle_air") {
                const toggle = page.getByRole("checkbox", {
                  name: /PM2.5 ถึงหรือเกินค่าที่ตั้งไว้/,
                });
                expected = !(await toggle.isChecked());
                await toggle.setChecked(expected);
              } else if (action === "quiet_hours") {
                await page
                  .getByLabel("เริ่มไม่รบกวน", { exact: true })
                  .fill("22:30");
                await page
                  .getByLabel("กลับมาแจ้งเตือน", { exact: true })
                  .fill("06:30");
              } else {
                const slider = page.getByRole("slider").nth(1);
                await slider.press(id % 2 ? "Home" : "End");
                expected = Number(await slider.inputValue());
              }
              await page
                .getByRole("button", { name: "บันทึกเงื่อนไข" })
                .click();
              if (saveFails) {
                await page
                  .getByRole("alert")
                  .filter({ hasText: "บันทึกไม่สำเร็จ" })
                  .waitFor();
                await page.getByRole("button", { name: "ปิดการแก้ไข" }).click();
              } else {
                await ready();
                if (action === "toggle_air")
                  assert(
                    preferences.air_alerts === expected,
                    "air toggle lost",
                  );
                if (action === "radius")
                  assert(preferences.radius_km === expected, "radius lost");
                if (action === "quiet_hours")
                  assert(
                    preferences.quiet_hours_start === "22:30" &&
                      preferences.quiet_hours_end === "06:30",
                    "quiet hours lost",
                  );
              }
            } else if (action === "reload") {
              await page.reload({ waitUntil: "domcontentloaded" });
              await ready();
            }
            trace.push(action);
            assert(
              new URL(page.url()).pathname === "/settings/notifications",
              `action ${action} left notification settings`,
            );
            assert(
              new URL(page.url()).searchParams.get("returnTo") === origin,
              `action ${action} changed origin`,
            );
            assert(
              !(await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              )),
              "horizontal overflow",
            );
            assert(
              errors.length === 0,
              `browser page errors: ${errors.join("; ")}`,
            );
          }
          await page.getByRole("link", { name: "ปิดการตั้งค่า" }).click();
          await page.waitForURL((url) => url.pathname === origin);
          trace.push("close_to_origin");
          results.push({
            id,
            path,
            origin,
            width,
            gpsMode,
            initialStatus,
            saveFails,
            gpsSaveFails,
            clearFails,
            trace,
            mockLineSends,
            preferenceWrites,
            locationWrites,
            deletes,
            status: "passed",
          });
        } catch (error) {
          results.push({
            id,
            path,
            origin,
            width,
            gpsMode,
            initialStatus,
            trace,
            status: "failed",
            error: String(error.message),
          });
          if (
            results.filter((result) => result.status === "failed").length <= 4
          )
            await page
              .screenshot({
                path: `output/playwright/line-route-failure-${id}.png`,
                fullPage: true,
              })
              .catch(() => undefined);
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, count) }, worker));
  results.sort((a, b) => a.id - b.id);
  return {
    start,
    count,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    paths: results,
  };
}
