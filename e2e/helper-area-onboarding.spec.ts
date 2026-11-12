import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { MeasurementHelperLocation } from "@/frontend/types";
async function helpers(page: Page, initial: MeasurementHelperLocation[] = []) {
  const settings = {
    enabled: true,
    observed_at: null,
    registered_locations_enabled: true,
    locations: initial,
  };
  let fail = false;
  await page.route("**/api/measurement-requests/helper", (route) => {
    if (route.request().method() === "PUT")
      settings.enabled = route.request().postDataJSON().enabled;
    return route.fulfill({ json: settings });
  });
  await page.route(
    /\/api\/measurement-requests\/helper\/locations(?:\/[12])?$/,
    (route) => {
      if (fail) {
        fail = false;
        return route.fulfill({ status: 503, json: { detail: "offline" } });
      }
      const slot =
        Number(new URL(route.request().url()).pathname.split("/").at(-1)) ||
        (settings.locations.some((p) => p.slot === 1) ? 2 : 1);
      if (route.request().method() === "DELETE") {
        settings.locations = settings.locations.filter((p) => p.slot !== slot);
        return route.fulfill({ json: { ok: true } });
      }
      const place = { ...route.request().postDataJSON(), slot };
      settings.locations = [
        ...settings.locations.filter((p) => p.slot !== slot),
        place,
      ].sort((a, b) => a.slot - b.slot);
      return route.fulfill({ json: place });
    },
  );
  await page.route("**/api/locations/reverse?*", (route) =>
    route.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
  );
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        locations: [
          {
            id: "home",
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
  return {
    settings,
    failSave: () => {
      fail = true;
    },
  };
}
async function submitFirst(page: Page) {
  let row: Record<string, unknown> | null = null;
  await page.route("**/api/measurement-requests", (route) => {
    if (route.request().method() === "POST") {
      row = {
        ...route.request().postDataJSON(),
        id: "REQ-INTRO",
        is_owner: true,
        status: "active",
        recipient_count: 0,
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1800000).toISOString(),
      };
      return route.fulfill({ status: 201, json: row });
    }
    return route.fulfill({ json: { requests: row ? [row] : [] } });
  });
  await page.route("**/api/measurement-requests/REQ-INTRO", (route) =>
    route.fulfill({ json: row }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }).click();
  await page.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "ส่งคำขอ", exact: true }).click();
}
async function scan(page: Page) {
  const a = await new AxeBuilder({ page })
    .exclude(".leaflet-control-attribution")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
}

test("first request offers private helper areas, setup returns to the submitted request", async ({
  page,
}) => {
  const state = await helpers(page);
  await submitFirst(page);
  const intro = page.getByRole("dialog", { name: "รับคำขอจากคนใกล้คุณ" });
  await expect(intro).toBeVisible();
  await scan(page);
  await page.screenshot({
    path: `output/playwright/helper-intro-${page.viewportSize()?.width}.png`,
  });
  await intro.getByRole("link", { name: "ตั้งค่าพื้นที่ตอนนี้" }).click();
  await expect(page).toHaveURL(/\/settings\/helper-areas\?request=REQ-INTRO$/);
  await expect(
    page.getByRole("switch", { name: "รับแจ้งคำขอให้ช่วยวัด" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "เพิ่มพื้นที่รับคำขอ" });
  await editor.getByPlaceholder("ค้นหาสถานที่หรือที่อยู่").fill("สถานที่ทดสอบ");
  await editor.getByRole("button", { name: /สถานที่ทดสอบ.*นครปฐม/ }).click();
  await editor
    .getByRole("button", { name: "ยืนยันจุดนี้", exact: true })
    .click();
  await editor.getByRole("button", { name: "บ้าน", exact: true }).click();
  await editor.getByRole("button", { name: "บันทึกและเปิดรับคำขอ" }).click();
  await expect(editor).toHaveCount(0);
  expect(state.settings.locations).toHaveLength(1);
  await expect(
    page.getByRole("switch", { name: "รับคำขอที่ บ้าน" }),
  ).toBeChecked();
  await page.getByRole("link", { name: "กลับไปคำขอของฉัน" }).click();
  await expect(page).toHaveURL(/\/requests\/REQ-INTRO$/);
  await expect(
    page.getByRole("region", { name: "รายละเอียดคำขอ" }),
  ).toContainText("พื้นที่ทดสอบ");
  await expect(intro).toHaveCount(0);
  await page.goto("/settings/helper-areas?request=REQ-INTRO");
  await page.getByRole("link", { name: "ปิดการตั้งค่า", exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/REQ-INTRO$/);
});

test("intro offers later, close, Escape and never without enabling helper consent", async ({
  page,
}) => {
  const state = await helpers(page);
  await submitFirst(page);
  const intro = page.getByRole("dialog", { name: "รับคำขอจากคนใกล้คุณ" });
  await intro
    .getByRole("button", { name: "เตือนภายหลัง", exact: true })
    .click();
  await expect(intro).toHaveCount(0);
  await page.reload();
  await expect(intro).toHaveCount(0);
  expect(state.settings.locations).toHaveLength(0);
  for (const choice of [
    "ปิดคำแนะนำพื้นที่รับคำขอ",
    "Escape",
    "ไม่แสดงคำแนะนำนี้อีก",
  ]) {
    await page.evaluate(() =>
      localStorage.removeItem(
        "clearpath:helper-area-intro:v1:00000000-0000-0000-0000-000000000001",
      ),
    );
    await page.reload();
    await submitFirst(page);
    await expect(intro).toBeVisible();
    if (choice === "Escape") await page.keyboard.press("Escape");
    else await intro.getByRole("button", { name: choice, exact: true }).click();
    await expect(intro).toHaveCount(0);
  }
  expect(state.settings.locations).toHaveLength(0);
});

test("saved helper areas edit, pause, resume, keep/delete and retry with working Back", async ({
  page,
}) => {
  const state = await helpers(page, [
    {
      slot: 1,
      name: "บ้าน",
      emoji: "🏠",
      address: "ตลิ่งชัน กรุงเทพมหานคร",
      lat: 13.8,
      lon: 100.1,
      enabled: true,
    },
    {
      slot: 2,
      name: "ที่ทำงาน",
      emoji: "🌳",
      address: "นครปฐม",
      lat: 13.7,
      lon: 100.1,
      enabled: true,
    },
  ]);
  await page.goto("/settings/notifications");
  await scan(page);
  await page.screenshot({
    path: `output/playwright/helper-areas-${page.viewportSize()?.width}.png`,
  });
  const master = page.getByRole("switch", { name: "รับแจ้งคำขอให้ช่วยวัด" });
  await master.click();
  await expect(master).not.toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: "พักรับทุกพื้นที่อยู่" }),
  ).toBeVisible();
  await master.click();
  await expect(master).toBeChecked();
  const work = page.getByRole("switch", { name: "รับคำขอที่ ที่ทำงาน" });
  await work.click();
  await expect(work).not.toBeChecked();
  await page
    .getByRole("button", { name: "แก้ไขสถานที่ บ้าน", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "แก้ไขพื้นที่รับคำขอ" });
  await editor.getByRole("button", { name: "แก้ไขจุดบนแผนที่" }).click();
  await editor.getByRole("button", { name: "กลับไปค้นหาสถานที่" }).click();
  await editor.getByRole("button", { name: "กลับไปตั้งค่าพื้นที่" }).click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("button", { name: "แก้ไขสถานที่ บ้าน", exact: true })
    .click();
  await editor.getByLabel("ชื่อพื้นที่รับคำขอ").fill("บ้านของฉัน");
  state.failSave();
  await editor
    .getByRole("button", { name: "บันทึกพื้นที่", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await editor
    .getByRole("button", { name: "บันทึกพื้นที่", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("button", { name: "ลบสถานที่ ที่ทำงาน", exact: true })
    .click();
  await page.getByRole("button", { name: "เก็บไว้", exact: true }).click();
  expect(state.settings.locations).toHaveLength(2);
  await page
    .getByRole("button", { name: "ลบสถานที่ ที่ทำงาน", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ยืนยันลบสถานที่ ที่ทำงาน", exact: true })
    .click();
  await expect.poll(() => state.settings.locations.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "กลับไปการตั้งค่า" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("existing helper areas skip the intro and settings load failures offer retry", async ({
  page,
}) => {
  await helpers(page, [
    {
      slot: 1,
      name: "บ้าน",
      address: "นครปฐม",
      lat: 13.82,
      lon: 100.06,
      enabled: true,
    },
  ]);
  await submitFirst(page);
  await expect(
    page.getByRole("region", { name: "รายละเอียดจุดขอค่าฝุ่น" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "รับคำขอจากคนใกล้คุณ" }),
  ).toHaveCount(0);
  let fail = true;
  await page.route("**/api/measurement-requests/helper", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { detail: "offline" } }
        : {
            json: {
              enabled: false,
              registered_locations_enabled: true,
              locations: [],
            },
          },
    ),
  );
  await page.goto("/settings/helper-areas");
  await expect(
    page.getByRole("region", { name: "พื้นที่รับคำขอ" }).getByRole("alert"),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "ลองโหลดพื้นที่อีกครั้ง", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "เพิ่มพื้นที่รับคำขอ" });
  await editor
    .getByRole("button", { name: "กลับไปตั้งค่าพื้นที่", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "ปิดการเลือกพื้นที่", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("link", { name: "กลับไปการแจ้งเตือน", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
});

test("a three-day reminder returns on the next map visit and can be dismissed permanently", async ({
  page,
}) => {
  await helpers(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "clearpath:helper-area-intro:v1:00000000-0000-0000-0000-000000000001",
      JSON.stringify({
        choice: "later",
        until: Date.now() - 1000,
        requestId: "REQ-OLDER",
      }),
    ),
  );
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "รับคำขอจากคนใกล้คุณ" });
  await expect(intro).toBeVisible();
  await intro
    .getByRole("button", { name: "ไม่แสดงคำแนะนำนี้อีก", exact: true })
    .click();
  await expect(intro).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "clearpath:helper-area-intro:v1:00000000-0000-0000-0000-000000000001",
          )!,
        ).choice,
    ),
  ).toBe("never");
});
