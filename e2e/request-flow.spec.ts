import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const region = (page: Page) =>
  page.getByRole("region", { name: "ขอค่าฝุ่นบนแผนที่", exact: true });
async function locations(page: Page) {
  await page.route("**/api/locations/reverse?*", (route) =>
    route.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
  );
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        locations: [
          {
            id: "test-place",
            name: "สถานที่ทดสอบ",
            address: "นครปฐม",
            lat: 13.82,
            lon: 100.06,
            kind: "place",
            source: "local",
          },
        ],
      },
    }),
  );
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }).click();
}
async function pick(page: Page) {
  await page.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }).click();
  await expect(
    region(page).getByRole("button", { name: "ส่งคำขอ", exact: true }),
  ).toBeEnabled();
}

test("request Back unwinds nested search, preserves schedule, and Close resets a new flow", async ({
  page,
}) => {
  await locations(page);
  await open(page);
  await pick(page);
  const form = region(page);
  await form.getByRole("button", { name: "ก่อนเวลาที่กำหนด" }).click();
  const time = new Date(Date.now() + 3600000 + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
  await form.getByLabel("ต้องการข้อมูลก่อน (ภายใน 24 ชม.)").fill(time);
  await form.getByRole("button", { name: "กลับไปเลือกจุดบนแผนที่" }).click();
  await page
    .getByRole("button", { name: "ค้นหาหรือแก้ไขสถานที่ขอค่าฝุ่น" })
    .click();
  await page
    .getByRole("button", { name: "กลับไปเลือกจุดบนแผนที่", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "สถานที่ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }).click();
  await expect(form.getByLabel("ต้องการข้อมูลก่อน (ภายใน 24 ชม.)")).toHaveValue(
    time,
  );
  await form.getByRole("button", { name: "กลับไปเลือกจุดบนแผนที่" }).click();
  await page.getByRole("button", { name: "กลับขั้นก่อนหน้า" }).click();
  await page.getByRole("button", { name: "กลับไปแผนที่", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }).click();
  await pick(page);
  await expect(
    form.getByRole("button", { name: "ตอนนี้", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "ปิดการขอค่าฝุ่น" }).click();
  await expect(form).toHaveCount(0);
});

test("request submit failure retries once, cancel can be kept, history and details return correctly", async ({
  page,
}) => {
  await locations(page);
  let row: Record<string, unknown> | null = null;
  let calls = 0;
  let firstKey: string | undefined;
  let finishCreate: (() => void) | undefined;
  await page.route("**/api/measurement-requests", async (route) => {
    if (route.request().method() === "POST") {
      calls++;
      const body = route.request().postDataJSON();
      if (calls === 1) {
        firstKey = body.idempotency_key;
        return route.fulfill({
          status: 503,
          json: { detail: "ลองใหม่อีกครั้ง" },
        });
      }
      expect(body.idempotency_key).toBe(firstKey);
      row = {
        ...body,
        id: "REQ-FLOW-001",
        is_owner: true,
        status: "active",
        recipient_count: 0,
        requester_name: "ผู้ใช้ทดสอบ",
        created_at: new Date().toISOString(),
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1800000).toISOString(),
      };
      await new Promise<void>((resolve) => {
        finishCreate = resolve;
      });
      return route.fulfill({ status: 201, json: row });
    }
    return route.fulfill({ json: { requests: row ? [row] : [] } });
  });
  await page.route("**/api/measurement-requests/REQ-FLOW-001", (route) =>
    route.fulfill({ json: row }),
  );
  await page.route(
    "**/api/measurement-requests/REQ-FLOW-001/cancel",
    (route) => {
      row = { ...row, status: "cancelled" };
      return route.fulfill({ json: row });
    },
  );
  await open(page);
  await pick(page);
  const form = region(page);
  await form.getByRole("button", { name: "ส่งคำขอ", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await form.getByRole("button", { name: "ส่งคำขอ", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "กำลังบันทึก…", exact: true }),
  ).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "กลับไปเลือกจุดบนแผนที่" }),
  ).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "ปิดการขอค่าฝุ่น", exact: true }),
  ).toHaveCount(0);
  finishCreate?.();
  const card = page.getByRole("region", { name: "รายละเอียดจุดขอค่าฝุ่น" });
  await expect(card).toBeVisible();
  expect(calls).toBe(2);
  const grip = card.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  await expect(grip).toBeVisible();
  await grip.press("End");
  await expect(card).toHaveAttribute("data-expanded", "true");
  await card
    .getByRole("link", { name: "ติดตามคำขอ", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `output/playwright/request-track-${page.viewportSize()?.width}.png`,
  });
  await card.getByRole("link", { name: "ติดตามคำขอ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/REQ-FLOW-001$/);
  await expect(
    page.getByRole("region", { name: "รายละเอียดคำขอ" }),
  ).toContainText("พื้นที่ทดสอบ");
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }).click();
  await card.getByRole("button", { name: "เก็บไว้", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }).click();
  await card.getByRole("button", { name: "ยืนยันยกเลิกคำขอ" }).click();
  await expect(card).toHaveCount(0);
  await page.goto("/requests");
  await page.getByRole("button", { name: "ประวัติคำขอ", exact: true }).click();
  await page.getByRole("link", { name: "ดูประวัติคำขอ", exact: true }).click();
  await expect(page.getByText("ยกเลิกแล้ว", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("request search clears query and recent places, GPS selection and explicit exit work", async ({
  page,
}) => {
  await locations(page);
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 13.82, longitude: 100.06, accuracy: 10 });
  await open(page);
  const scan = await new AxeBuilder({ page })
    .exclude(".leaflet-control-attribution")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: `output/playwright/request-search-flow-${page.viewportSize()?.width}.png`,
  });

  const input = page.getByPlaceholder("ค้นหาสถานที่หรือที่อยู่");
  await input.fill("สถานที่ทดสอบ");
  await page.getByRole("button", { name: "ล้างคำค้นหา" }).click();
  await expect(input).toHaveValue("");
  await input.fill("สถานที่ทดสอบ");
  await page.getByRole("button", { name: /สถานที่ทดสอบ.*นครปฐม/ }).click();
  await page.getByRole("button", { name: "กลับขั้นก่อนหน้า" }).click();
  const history = page.getByRole("region", { name: "ประวัติการค้นหา" });
  await history.getByRole("button", { name: /สถานที่ทดสอบ.*นครปฐม/ }).click();
  await page.getByRole("button", { name: "กลับขั้นก่อนหน้า" }).click();
  await page
    .getByRole("button", { name: "ลบ สถานที่ทดสอบ จากประวัติ", exact: true })
    .click();
  await expect(history).toHaveCount(0);
  await input.fill("สถานที่ทดสอบ");
  await page.getByRole("button", { name: /สถานที่ทดสอบ.*นครปฐม/ }).click();
  await page.getByRole("button", { name: "กลับขั้นก่อนหน้า" }).click();
  await page.getByRole("button", { name: "ล้างประวัติทั้งหมด" }).click();
  await expect(history).toHaveCount(0);
  await page.getByRole("button", { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
  await expect(
    page.getByRole("group", { name: "สถานที่ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ค้นหาหรือแก้ไขสถานที่ขอค่าฝุ่น" })
    .click();
  await page
    .getByRole("button", { name: "ปิดการขอค่าฝุ่น", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
});

test("helper opens reporting from a request and can return to decline without owner controls", async ({
  page,
}) => {
  const row = {
    id: "REQ-HELP-001",
    is_owner: false,
    status: "active",
    place_name: "พื้นที่ผู้ขอ",
    lat: 13.82,
    lon: 100.06,
    radius_km: 2,
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    created_at: new Date().toISOString(),
    matched_location_at: new Date().toISOString(),
    recipient_count: 1,
    xp_enabled: false,
  };
  let declined = false;
  await page.route("**/api/measurement-requests/REQ-HELP-001", (route) =>
    route.fulfill({ json: { ...row, declined } }),
  );
  await page.route(
    "**/api/measurement-requests/REQ-HELP-001/decline",
    (route) => {
      declined = true;
      return route.fulfill({ json: { ...row, declined } });
    },
  );
  await page.goto("/requests/REQ-HELP-001");
  await expect(
    page.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "ช่วยรายงานค่าฝุ่น", exact: true })
    .click();
  await expect(page).toHaveURL(/\/report\?request=REQ-HELP-001$/);
  await page.getByRole("link", { name: "ดูสถานะคำขอ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/REQ-HELP-001$/);
  await page.getByRole("button", { name: "ไม่สะดวก", exact: true }).click();
  await expect(
    page.getByText("คุณเลือกไม่สะดวกช่วยวัดคำขอนี้แล้ว", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ช่วยรายงานค่าฝุ่น", exact: true }),
  ).toHaveCount(0);
  // Returning from reporting must not create a detail/report Back loop.
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("direct request detail Back stays inside the app through list and map fallbacks", async ({
  page,
}) => {
  await page.route("**/api/measurement-requests**", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("/REQ-DIRECT")
        ? {
            id: "REQ-DIRECT",
            is_owner: true,
            status: "cancelled",
            place_name: "คำขอเดิม",
            lat: 13.82,
            lon: 100.06,
            radius_km: 2,
            starts_at: new Date().toISOString(),
            expires_at: new Date().toISOString(),
          }
        : { requests: [] },
    }),
  );
  await page.goto("/requests/REQ-DIRECT");
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("request GPS denial and failed search retain working map and exit fallbacks", async ({
  page,
}) => {
  await locations(page);
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
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({ status: 503, json: { detail: "unavailable" } }),
  );
  await open(page);
  await page.getByPlaceholder("ค้นหาสถานที่หรือที่อยู่").fill("ค้นหาไม่สำเร็จ");
  await expect(
    page
      .getByRole("region", { name: "เลือกพื้นที่ขอค่าฝุ่น" })
      .getByRole("alert"),
  ).toContainText("ค้นหาไม่สำเร็จ");
  await page.getByRole("button", { name: "ล้างคำค้นหา" }).click();
  await page.getByRole("button", { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
  await expect(
    page
      .getByRole("region", { name: "เลือกพื้นที่ขอค่าฝุ่น" })
      .getByRole("alert"),
  ).toContainText("ยังใช้ตำแหน่งปัจจุบันไม่ได้");
  await page.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await expect(
    page.getByRole("group", { name: "สถานที่ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
  await region(page).getByRole("button", { name: "ปิดการขอค่าฝุ่น" }).focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
});
