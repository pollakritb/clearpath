import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildDemoCommunityReports } from "../frontend/lib/demo-community";

test("older retrieved notifications stay reachable on mobile", async ({
  page,
}) => {
  await page.route("**/api/notifications", (route) =>
    route.fulfill({
      json: {
        unread_count: 15,
        notifications: Array.from({ length: 15 }, (_, i) => ({
          id: `NTF-${String(i + 1).padStart(6, "0")}`,
          title: `แจ้งเตือนทดสอบ ${i + 1}`,
          body: "ข้อมูลทดสอบภายในเครื่อง",
          url: "/",
          event_type: "announcement",
          created_at: new Date().toISOString(),
          read_at: null,
        })),
      },
    }),
  );
  await page.goto("/community");
  await page.getByRole("button", { name: "การแจ้งเตือน", exact: true }).click();
  const inbox = page.getByRole("region", {
    name: "กล่องแจ้งเตือน",
    exact: true,
  });
  await expect(
    inbox.getByText("แจ้งเตือนทดสอบ 11", { exact: true }),
  ).toHaveCount(0);
  await inbox
    .getByRole("button", { name: "ดูการแจ้งเตือนเพิ่มเติม (5)" })
    .click();
  await expect(
    inbox.getByText("แจ้งเตือนทดสอบ 15", { exact: true }),
  ).toBeVisible();
  await expect(inbox.getByRole("status")).toHaveText("แสดง 15 จาก 15 รายการ");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("map, refresh and settings controls have practical mobile touch targets", async ({
  page,
}) => {
  for (const entry of [
    { path: "/", name: "ค้นหาสถานที่หรือสถานี" },
    { path: "/air", name: "รีเฟรชข้อมูลล่าสุด" },
    { path: "/settings", name: "ปิดการตั้งค่า" },
  ]) {
    await page.goto(entry.path);
    const control = page.getByRole(
      entry.path === "/settings" ? "link" : "button",
      { name: entry.name, exact: true },
    );
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("forecast service failures explain recovery without exposing server configuration", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/forecast-grid/metadata", (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? { status: 503, json: { detail: "SUPABASE_URL / SERVICE_ROLE_KEY" } }
        : {
            json: {
              status: "unavailable",
              generation_id: null,
              valid_times: [],
              latitudes: [],
              longitudes: [],
              stale: true,
            },
          },
    );
  });
  await page.goto("/?layer=cams");
  await expect(
    page.getByRole("status").filter({ hasText: "โหลดพยากรณ์ไม่สำเร็จ" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("SERVICE_ROLE_KEY");
  await page.getByRole("button", { name: "ลองโหลดพยากรณ์ใหม่" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(
    page.getByRole("status").filter({ hasText: "ยังไม่มีพยากรณ์ที่ใช้งานได้" }),
  ).toBeVisible();
});

test("a temporary OCR outage can be retried with the captured photo @camera-390", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["camera", "geolocation"]);
  await context.setGeolocation({ latitude: 13.8199, longitude: 100.0622 });
  let attempts = 0;
  await page.route("**/api/community/report-drafts", (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? { status: 503, json: { detail: "OPENAI_API_KEY" } }
        : {
            status: 201,
            json: {
              id: "retry-draft",
              ocr_pm25: 23.4,
              ocr_available: true,
              ocr_status: "ready",
              captured_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 900000).toISOString(),
            },
          },
    );
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(
    page.getByText("กล้องหลังพร้อมแล้ว ถือเครื่องให้นิ่ง", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "ภาพที่เลือกยังอยู่" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("OPENAI_API_KEY");
  await page.getByRole("button", { name: "ลองอ่านภาพอีกครั้ง" }).click();
  await expect(page.getByLabel("PM2.5 23.4 µg/m³")).toBeVisible();
  expect(attempts).toBe(2);
  await expect(
    page.getByRole("button", { name: "ส่งรายงาน", exact: true }),
  ).toBeEnabled();
});

test("admin report-count badges retain AA contrast when populated", async ({
  page,
}) => {
  const reports = buildDemoCommunityReports().slice(0, 10);
  await page.route("**/api/admin/reports", (route) =>
    route.fulfill({ json: { reports, count: reports.length } }),
  );
  await page.goto("/admin");
  await expect(page.locator(".cp-admin-nav-item > b")).toHaveText("10");
  const result = await new AxeBuilder({ page })
    .include(".cp-admin-nav-item > b")
    .withRules(["color-contrast"])
    .analyze();
  expect(result.violations).toEqual([]);
});
