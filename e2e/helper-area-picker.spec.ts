import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const editor = (page: Page) =>
  page.getByRole("dialog", { name: "เพิ่มพื้นที่รับคำขอ" });
async function open(page: Page) {
  await page.route("**/api/measurement-requests/helper", (r) =>
    r.fulfill({
      json: {
        enabled: false,
        registered_locations_enabled: true,
        locations: [],
      },
    }),
  );
  await page.route("**/api/locations/reverse?*", (r) =>
    r.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
  );
  await page.route("**/api/locations/search?*", (r) =>
    r.fulfill({
      json: {
        locations: [
          {
            id: "place",
            name: "สถานที่ใหม่",
            address: "นครปฐม",
            lat: 13.9,
            lon: 100.2,
            kind: "place",
            source: "local",
          },
        ],
      },
    }),
  );
  await page.goto("/settings/helper-areas");
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  await editor(page)
    .getByRole("button", { name: /เลือกบนแผนที่/ })
    .click();
}

test("helper picker uses a centered pin without a radius, GPS and editable top search", async ({
  page,
}) => {
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 13.82, longitude: 100.06, accuracy: 10 });
  await open(page);
  const d = editor(page);
  const confirm = d.getByRole("button", { name: "ยืนยันจุดนี้", exact: true });
  await expect(confirm).toBeDisabled();
  const pin = d.locator(".cp-request-center-pin");
  await expect(pin).toBeVisible();
  await expect(d.locator("path.leaflet-interactive")).toHaveCount(0);
  const locate = d.getByRole("button", { name: "ตำแหน่งของฉัน", exact: true });
  await locate.click();
  await expect(confirm).toBeEnabled();
  await expect(d.locator(".cp-helper-editor__pick-address")).toHaveText(
    "นครปฐม",
  );
  await expect
    .poll(() =>
      d.evaluate((root) => {
        const pin = root
          .querySelector(".cp-request-center-pin")!
          .getBoundingClientRect();
        const map = root
          .querySelector(".leaflet-container")!
          .getBoundingClientRect();
        return Math.abs(pin.x + pin.width / 2 - map.x - map.width / 2);
      }),
    )
    .toBeLessThan(2);
  await expect
    .poll(() =>
      d.evaluate((root) => {
        const pin = root
          .querySelector(".cp-request-center-pin")!
          .getBoundingClientRect();
        const map = root
          .querySelector(".leaflet-container")!
          .getBoundingClientRect();
        return Math.abs(pin.bottom - 2 - map.y - map.height / 2);
      }),
    )
    .toBeLessThan(3);
  const l = await locate.boundingBox();
  const sheet = await d
    .getByRole("region", { name: "ยืนยันพื้นที่รับคำขอ" })
    .boundingBox();
  expect(l!.width).toBeGreaterThanOrEqual(44);
  expect(l!.y + l!.height).toBeLessThan(sheet!.y);
  const map = d.locator(".leaflet-container");
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await expect(confirm).toBeEnabled();
  await d.getByRole("button", { name: "ค้นหาหรือแก้ไขพื้นที่รับคำขอ" }).click();
  await d.getByPlaceholder("ค้นหาสถานที่หรือที่อยู่").fill("สถานที่ใหม่");
  await d.getByRole("button", { name: /สถานที่ใหม่.*นครปฐม/ }).click();
  await expect(
    d.getByRole("button", { name: "ค้นหาหรือแก้ไขพื้นที่รับคำขอ" }),
  ).toContainText("สถานที่ใหม่");
  const a = await new AxeBuilder({ page })
    .exclude(".leaflet-control-attribution")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: `output/playwright/helper-picker-${page.viewportSize()?.width}.png`,
  });
  await confirm.click();
  await expect(d.getByText("สัญลักษณ์บนแผนที่", { exact: true })).toHaveCount(
    0,
  );
  await expect(d.getByRole("button", { name: /ใช้สัญลักษณ์/ })).toHaveCount(0);
  await d
    .getByRole("button", { name: "กลับไปเลือกจุดบนแผนที่", exact: true })
    .click();
  await expect(
    d.getByRole("button", { name: "ค้นหาหรือแก้ไขพื้นที่รับคำขอ" }),
  ).toContainText("สถานที่ใหม่");
  await d
    .getByRole("button", { name: "ปิดการเลือกพื้นที่", exact: true })
    .click();
  await expect(d).toHaveCount(0);
});

test("denied GPS keeps search and Back usable and the main map has no saved-area markers", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, error: PositionErrorCallback) =>
          error({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  );
  await open(page);
  const d = editor(page);
  await d.getByRole("button", { name: "ตำแหน่งของฉัน", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("อนุญาตการเข้าถึงตำแหน่ง");
  await expect(
    d.getByRole("button", { name: "ยืนยันจุดนี้", exact: true }),
  ).toBeDisabled();
  await d
    .getByRole("button", { name: "กลับไปค้นหาสถานที่", exact: true })
    .click();
  await expect(d.getByPlaceholder("ค้นหาสถานที่หรือที่อยู่")).toBeVisible();
  await d
    .getByRole("button", { name: "กลับไปตั้งค่าพื้นที่", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await page.unroute("**/api/measurement-requests/helper");
  await page.route("**/api/measurement-requests/helper", (r) =>
    r.fulfill({
      json: {
        enabled: true,
        registered_locations_enabled: true,
        locations: [
          {
            slot: 1,
            name: "บ้านที่บันทึก",
            emoji: "🏠",
            lat: 13.82,
            lon: 100.06,
            enabled: true,
          },
          {
            slot: 2,
            name: "ที่ทำงาน",
            emoji: "🌳",
            lat: 13.9,
            lon: 100.2,
            enabled: true,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cp-saved-helper-marker")).toHaveCount(0);
});

test("a late GPS callback is ignored after closing the area picker", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          (
            window as unknown as { completeHelperGps: () => void }
          ).completeHelperGps = () =>
            success({
              coords: {
                latitude: 13.82,
                longitude: 100.06,
                accuracy: 10,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
        },
      },
    }),
  );
  await open(page);
  const d = editor(page);
  await d.getByRole("button", { name: "ตำแหน่งของฉัน", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "กำลังหาตำแหน่ง", exact: true }),
  ).toBeDisabled();
  await d
    .getByRole("button", { name: "ปิดการเลือกพื้นที่", exact: true })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as { completeHelperGps: () => void }
    ).completeHelperGps(),
  );
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  await d.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await expect(
    d.getByRole("button", { name: "ยืนยันจุดนี้", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
