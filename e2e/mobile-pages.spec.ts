import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", text: "คุณภาพอากาศทั่วไทย" },
  { path: "/air", text: "อากาศวันนี้" },
  { path: "/report", text: "ส่งข้อมูลจากเครื่องวัด" },
  { path: "/community", text: "ประกาศสำคัญ" },
  { path: "/settings", text: "การแสดงผล" },
  { path: "/admin", text: "ศูนย์ควบคุม ClearPath" },
  { path: "/offline", text: "ขณะนี้ไม่ได้เชื่อมต่ออินเทอร์เน็ต" },
];

for (const item of pages) {
  test(`${item.path} is mobile-safe and has no serious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(item.path);
    await expect(
      page.getByText(item.text, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.locator("nextjs-portal")).toHaveCount(0);

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

    const violations = await new AxeBuilder({ page })
      .exclude(".leaflet-control-attribution")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      violations.violations.filter((result) =>
        ["serious", "critical"].includes(result.impact ?? ""),
      ),
    ).toEqual([]);
  });
}

test("mobile primary navigation targets are at least 44px", async ({
  page,
}) => {
  await page.goto("/");
  const sizes = await page
    .getByRole("navigation", { name: "เมนูหลักบนมือถือ" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
  expect(sizes.length).toBe(4);
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
});

test("header actions expose refresh and a dedicated settings page", async ({
  page,
}) => {
  await page.goto("/air");
  await expect(
    page.getByRole("button", { name: "รีเฟรชข้อมูลล่าสุด" }),
  ).toBeVisible();

  const settings = page.getByRole("link", { name: "เปิดการตั้งค่า" });
  await expect(settings).toHaveAttribute("href", "/settings");
  await settings.click();
  await expect(page.getByRole("heading", { name: "การแสดงผล" })).toBeVisible();
  await expect(
    page.getByRole("switch", { name: /ตัวอักษรใหญ่/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: /คอนทราสต์สูง/ }),
  ).toBeVisible();
});

test("community page prioritizes announcements and keeps secondary tools collapsed", async ({
  page,
}) => {
  await page.goto("/community");

  await expect(
    page.getByRole("heading", { name: "ประกาศสำคัญ" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /การแจ้งเตือน/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /ส่งข้อมูลค่าฝุ่น/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "เมนูหลักบนมือถือ" })
      .getByRole("link", { name: "ข่าวสาร" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("ภาพรวม", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("แจ้งข้อมูลผิดพลาด", { exact: true }),
  ).toBeHidden();

  await page.getByText("เพิ่มเติม", { exact: true }).click();
  await expect(
    page.getByText("แจ้งข้อมูลผิดพลาด", { exact: true }),
  ).toBeVisible();
});

test("air summary automatically uses the current GPS position", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:3117",
  });
  await context.setGeolocation({ latitude: 13.75, longitude: 100.5 });
  await page.route("**/api/pm25/current", async (route) => {
    await route.fulfill({
      json: {
        count: 2,
        updated_at: "2026-09-16T00:30:00+07:00",
        fresh_count: 2,
        delayed_count: 0,
        expired_count: 0,
        stations: [
          {
            id: "gps-station",
            name_th: "สถานีใกล้ตำแหน่งทดสอบ",
            name_en: null,
            lat: 13.75,
            lon: 100.5,
            province: "กรุงเทพมหานคร",
            pm25: 22.4,
            aqi: null,
            color: null,
            level: null,
            recorded_at: "2026-09-16T00:30:00+07:00",
            data_status: "fresh",
            age_minutes: 5,
            eligible_for_surface: true,
            in_service_area: true,
          },
          {
            id: "nearby-station",
            name_th: "สถานีรอบข้าง",
            name_en: null,
            lat: 13.8,
            lon: 100.55,
            province: "กรุงเทพมหานคร",
            pm25: 35,
            aqi: null,
            color: null,
            level: null,
            recorded_at: "2026-09-16T00:30:00+07:00",
            data_status: "fresh",
            age_minutes: 5,
            eligible_for_surface: true,
            in_service_area: true,
          },
        ],
      },
    });
  });

  await page.goto("/air");
  const summary = page.getByRole("region", {
    name: "ภาพรวมอากาศวันนี้",
  });
  await expect(summary.getByText("ฝุ่นใกล้ตำแหน่งคุณ")).toBeVisible();
  await expect(summary.getByText("22.4", { exact: true })).toBeVisible();
  await expect(summary.getByText(/GPS คลาดเคลื่อนประมาณ/)).toBeVisible();
  await expect(summary.getByRole("button", { name: "อัปเดต" })).toBeVisible();
  await expect(summary.getByText(/ค่าเฉลี่ยทั้งประเทศ/)).toHaveCount(0);
});

test("LINE notification card explains production setup state on mobile", async ({
  page,
}) => {
  await page.goto("/community");
  await page.getByText("การแจ้งเตือน", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "แจ้งเตือนผ่าน LINE" }),
  ).toBeVisible();
  await expect(page.getByText("ยังไม่เชื่อม", { exact: true })).toBeVisible();
  await expect(
    page.getByText("ระบบ LINE ยังรอการเปิดใช้งาน Official Account", {
      exact: false,
    }),
  ).toBeVisible();
});

test("notification settings separate channels from conditions on mobile", async ({
  page,
}) => {
  await page.goto("/community");
  await page.getByText("การแจ้งเตือน", { exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "ช่องทางรับแจ้งเตือน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "แจ้งเตือนผ่าน LINE" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Web Push" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "เงื่อนไขแจ้งเตือน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "แก้ไขเงื่อนไข" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("เลือกประเภทเหตุการณ์")).toHaveCount(0);

  await page.getByRole("button", { name: "แก้ไขเงื่อนไข" }).click();
  await expect(page.getByText("เลือกประเภทเหตุการณ์")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "บันทึกเงื่อนไข" }),
  ).toBeVisible();
});

test("LINE linking flow creates a one-time code on mobile", async ({
  page,
}) => {
  await page.route("**/api/notifications/line", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        linked: false,
        linked_at: null,
        official_account_url: "https://line.me/R/ti/p/@clearpath",
      }),
    });
  });
  await page.route("**/api/notifications/line/link-code", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "CP-ABCD2345",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        official_account_url: "https://line.me/R/ti/p/@clearpath",
        instruction:
          "ส่งข้อความ CP-ABCD2345 ไปที่บัญชี LINE Official ของ ClearPath",
      }),
    });
  });

  await page.goto("/community");
  await page.getByText("การแจ้งเตือน", { exact: true }).click();
  await page.getByRole("button", { name: "สร้างรหัสเชื่อมบัญชี" }).click();
  await expect(page.getByText("CP-ABCD2345", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "คัดลอกรหัส" })).toBeVisible();
  await expect(page.getByText("หมดอายุใน", { exact: false })).toBeVisible();
});

test("mobile camera opens, becomes ready and captures a live frame", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Camera flow runs once.");
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(
    page.getByText("กล้องพร้อมแล้ว ถือเครื่องให้นิ่ง", { exact: false }),
  ).toBeVisible();
  const capture = page.getByRole("button", {
    name: "ถ่ายหน้าจอเครื่องวัด",
  });
  await expect(capture).toBeEnabled();
  await capture.click();
  await expect(
    page.getByRole("img", { name: "ภาพหน้าจอเครื่องวัดที่เพิ่งถ่าย" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("map separates official stations from community reports", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
    .click();

  const official = page.getByRole("button", {
    name: /สถานีตรวจวัดทางการ/,
  });
  const community = page.getByRole("button", {
    name: /รายงานจากบุคคล/,
  });
  const sensors = page.getByRole("button", {
    name: /สถานีเซนเซอร์ชุมชน/,
  });
  await expect(official).toBeVisible();
  await expect(sensors).toBeVisible();
  await expect(community).toBeVisible();
  await expect(official).toHaveAttribute("aria-pressed", "true");
  await expect(sensors).toHaveAttribute("aria-pressed", "true");
  await expect(community).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(/สีหมุดบอกระดับ PM2.5.*ไอคอนบอกเจ้าของข้อมูล/),
  ).toBeVisible();
});

test("community marker opens a distinct privacy-safe report card", async ({
  page,
}) => {
  await page.route("https://lh3.googleusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("**/api/community/reports", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        reports: [
          {
            id: "community-map-demo",
            display_name: "สมาชิกชุมชน",
            reporter_avatar_url:
              "https://lh3.googleusercontent.com/a/clearpath-e2e-reporter",
            show_reporter_profile: true,
            lat: 13.7367,
            lon: 100.5231,
            pm25: 42,
            trust_score: 84,
            verification_method: "automatic",
            age_minutes: 15,
            location_precision_m: 180,
            source_type: "individual",
            device_calibrated: true,
            calibrated_at: "2026-08-01",
            device_model: "Xiaomi Air Monitor",
            subdistrict: "ปทุมวัน",
            district: "ปทุมวัน",
            province: "กรุงเทพมหานคร",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  const marker = page.locator('[title^="รายงานจากบุคคล"]');
  await expect(marker).toHaveCount(1);
  await expect(
    marker.locator('.cp-community-marker[data-profile="true"] img'),
  ).toHaveAttribute(
    "src",
    "https://lh3.googleusercontent.com/a/clearpath-e2e-reporter",
  );
  await marker.click();

  const card = page.getByRole("region", {
    name: "รายละเอียดรายงานจากบุคคล",
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("รายงานจากบุคคล", { exact: true })).toBeVisible();
  await expect(card.getByText(/ผู้รายงาน สมาชิกชุมชน/)).toBeVisible();
  await expect(card.getByText(/สอบเทียบ/)).toBeVisible();
  await expect(card.getByText(/พิกัดจริงประมาณ 180 ม./)).toBeVisible();
});

test("large text and high contrast remain mobile-safe", async ({ page }) => {
  await page.goto("/settings");
  const largeText = page.getByRole("switch", { name: /ตัวอักษรใหญ่/ });
  const contrast = page.getByRole("switch", { name: /คอนทราสต์สูง/ });
  await largeText.click();
  await contrast.click();
  await expect(largeText).toHaveAttribute("aria-checked", "true");
  await expect(contrast).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("navigation", { name: "เมนูหลักบนมือถือ" })
    .getByRole("link", { name: "วันนี้" })
    .click();
  await expect(page).toHaveURL(/\/air$/);
  await expect(page.locator(".cp-app")).toHaveAttribute(
    "data-contrast",
    "true",
  );
  await expect(page.locator(".cp-app")).toHaveCSS("font-size", "18px");
  const state = await page.locator(".cp-app").evaluate((root) => ({
    viewport: root.ownerDocument.defaultView?.innerWidth ?? 0,
    document: root.ownerDocument.documentElement.scrollWidth,
  }));
  expect(state.document).toBeLessThanOrEqual(state.viewport);
});

test("installed service worker provides the explicit offline fallback", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator))
      throw new Error("service worker unsupported");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  try {
    await page.goto("/offline");
    await expect(
      page.getByRole("heading", { name: "ขณะนี้ไม่ได้เชื่อมต่ออินเทอร์เน็ต" }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
