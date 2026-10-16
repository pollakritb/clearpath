import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const outputDirectory = resolve("docs/assets/presentation-2026-09-17");

async function capture(
  page: import("@playwright/test").Page,
  filename: string,
) {
  mkdirSync(outputDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(outputDirectory, filename),
    fullPage: false,
    animations: "disabled",
  });
}

test.describe("presentation screenshots @presentation", () => {
  test("map overview, layers and official station", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "สถานะแผนที่ค่าฝุ่นปัจจุบัน" }),
    ).toBeVisible();
    await capture(page, "01-map-current-overview.png");

    await page
      .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
      .click();
    await expect(page.locator("#cp-map-layers-panel")).toBeVisible();
    await capture(page, "02-map-layer-types.png");
    await page.getByRole("button", { name: "ปิดตัวเลือกข้อมูล" }).click();

    const stationMarkers = page.locator(".cp-marker--station");
    const visibleIndex = await stationMarkers.evaluateAll((elements) =>
      elements.findIndex((element) => {
        const bounds = element.getBoundingClientRect();
        const top = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return top === element || element.contains(top);
      }),
    );
    expect(visibleIndex).toBeGreaterThanOrEqual(0);
    const stationMarker = stationMarkers.nth(visibleIndex);
    await expect(stationMarker).toBeVisible();
    await stationMarker.click();
    await page.getByRole("button", { name: "ดูรายละเอียดสถานี" }).click();
    await expect(
      page.getByRole("region", { name: "รายละเอียดสถานีตรวจวัดทางการ" }),
    ).toBeVisible();
    await capture(page, "03-official-station-detail.png");
  });

  test("identified user report detail and engagement", async ({ page }) => {
    await page.route("https://lh3.googleusercontent.com/**", async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#d88a32"/><circle cx="48" cy="37" r="18" fill="#fff"/><path d="M18 88c4-21 16-31 30-31s26 10 30 31" fill="#fff"/></svg>`,
      });
    });
    await page.route("**/api/community/reports", async (route) => {
      await route.fulfill({
        json: {
          count: 1,
          reports: [
            {
              id: "community-map-demo",
              display_name: "สมาชิกชุมชน",
              reporter_avatar_url:
                "https://lh3.googleusercontent.com/a/clearpath-slide-reporter",
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
              like_count: 12,
              dislike_count: 1,
              comment_count: 3,
              device_model: "Xiaomi Air Monitor",
              subdistrict: "ปทุมวัน",
              district: "ปทุมวัน",
              province: "กรุงเทพมหานคร",
            },
          ],
        },
      });
    });
    await page.route(
      "**/api/community/reports/community-map-demo/engagement**",
      async (route) => {
        await route.fulfill({
          json: {
            like_count: 12,
            dislike_count: 1,
            comment_count: 3,
            viewer_reaction: null,
            comments: [
              {
                id: "slide-comment",
                report_id: "community-map-demo",
                user_id: "community-user",
                display_name: "ผู้ใช้ใกล้เคียง",
                avatar_url: null,
                body: "ค่าตรงกับเครื่องวัดในพื้นที่ ขอบคุณสำหรับข้อมูล",
                created_at: new Date().toISOString(),
                is_own: false,
              },
            ],
          },
        });
      },
    );

    await page.goto("/");
    const marker = page.locator('[title^="รายงานจากบุคคล"]');
    await expect(marker).toHaveCount(1);
    await marker.click({ force: true });
    const card = page.getByRole("region", {
      name: "รายละเอียดรายงานจากบุคคล",
    });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" })
      .click();
    await capture(page, "04-user-report-detail.png");

    await card.getByRole("button", { name: /ความคิดเห็น 3/ }).click();
    await expect(card.getByText(/ค่าตรงกับเครื่องวัดในพื้นที่/)).toBeVisible();
    await capture(page, "05-user-report-comments.png");
  });

  test("today and forecast", async ({ page }) => {
    await page.goto("/air?station=81t");
    await expect(
      page.getByRole("region", { name: "ภาพรวมอากาศวันนี้" }),
    ).toBeVisible();
    await capture(page, "06-today-current-air.png");

    const forecast = page.locator(".cp-forecast-card");
    await expect(forecast).toBeVisible();
    await forecast.scrollIntoViewIfNeeded();
    await forecast
      .getByRole("button", { name: "ดูรายชั่วโมง 24 ช่วงเวลา" })
      .click();
    await capture(page, "07-forecast-24-hours.png");

    const comparison = forecast.getByText("เปรียบเทียบแหล่งข้อมูล");
    if (await comparison.isVisible()) {
      await comparison.click();
      await capture(page, "08-forecast-source-detail.png");
    } else {
      await forecast.getByText("รายละเอียดและวิธีคำนวณ").click();
      await capture(page, "08-forecast-method-detail.png");
    }
  });

  test("camera, OCR review and report submission", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["camera", "geolocation"]);
    await context.setGeolocation({ latitude: 13.8199, longitude: 100.0622 });
    await page.route("**/api/community/report-drafts", async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          id: "presentation-report-draft",
          ocr_pm25: 18.5,
          ocr_confidence: 1,
          ocr_available: true,
          ocr_status: "ready",
          device_detected: true,
          display_clear: true,
          duplicate_detected: false,
          clock_warning: false,
          captured_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          image_preview_url: null,
        },
      });
    });
    await page.route(
      "**/api/community/report-drafts/presentation-report-draft/submit",
      async (route) => {
        await route.fulfill({
          status: 201,
          json: {
            report: { verified_pm25: 18.5, user_claimed_pm25: 18.5 },
            ocr_available: true,
            review_outcome: "automatic_approved",
            review_reasons: ["OCR อ่านตัวเลข PM2.5 จากภาพและเผยแพร่อัตโนมัติ"],
            message: "ระบบตรวจหลักฐานและอนุมัติรายงานอัตโนมัติแล้ว",
          },
        });
      },
    );
    await page.addInitScript(() => {
      const devices = ["back-camera", "front-camera"].map((deviceId) => ({
        deviceId,
        groupId: "clearpath-presentation",
        kind: "videoinput" as MediaDeviceKind,
        label: deviceId,
        toJSON: () => ({}),
      }));
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        configurable: true,
        value: async () => devices,
      });
    });

    await page.goto("/report");
    await capture(page, "09-report-start.png");
    await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
    await expect(page.getByText(/กล้องหลังพร้อมแล้ว/)).toBeVisible();
    await capture(page, "10-report-live-camera.png");

    await page.getByRole("button", { name: "สลับเป็นกล้องหน้า" }).click();
    await expect(page.getByText(/กล้องหน้าพร้อมแล้ว/)).toBeVisible();
    await page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" }).click();
    await expect(
      page.getByRole("img", { name: "ภาพหน้าจอเครื่องวัดที่เพิ่งถ่าย" }),
    ).toBeVisible();
    await expect(
      page.getByText("ยืนยันตำแหน่ง", { exact: true }),
    ).toBeVisible();
    await capture(page, "11-report-photo-and-gps.png");

    const analyze = page.getByRole("button", { name: "อ่านค่าจากภาพ" });
    await expect(analyze).toBeEnabled();
    await analyze.click();
    await expect(
      page.getByText("ตรวจรายละเอียดก่อนส่ง", { exact: true }),
    ).toBeVisible();
    await capture(page, "12-report-ocr-review.png");

    await page.getByRole("checkbox", { name: /ยืนยันวิธีวัดถูกต้อง/ }).check();
    await page.getByRole("button", { name: "ยืนยันและส่งข้อมูล" }).click();
    await expect(
      page.getByRole("heading", { name: "รายงานผ่านการตรวจอัตโนมัติ" }),
    ).toBeVisible();
    await capture(page, "13-report-submitted.png");
  });

  test("news, profile, settings and notifications", async ({ page }) => {
    await page.goto("/community");
    await expect(
      page.getByRole("heading", { name: "ข่าวสารล่าสุด" }),
    ).toBeVisible();
    await capture(page, "14-news-and-announcements.png");

    await page.goto("/profile");
    await expect(page.getByText("กิจกรรมและอันดับ")).toBeVisible();
    await page.getByText("กิจกรรมและอันดับ").click();
    await expect(
      page.getByText(/Top Contributor|อันดับ/).first(),
    ).toBeVisible();
    await capture(page, "15-profile-and-leaderboard.png");

    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "การแสดงผล" }),
    ).toBeVisible();
    await capture(page, "16-settings-and-google-account.png");

    await page.goto("/settings/notifications");
    await expect(
      page.getByRole("heading", { name: "การแจ้งเตือน" }),
    ).toBeVisible();
    await capture(page, "17-notification-channels.png");
  });

  test("admin overview and operational pages", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "ศูนย์ควบคุม ClearPath" }),
    ).toBeVisible();
    await capture(page, "18-admin-overview.png");

    const navigation = page.getByRole("navigation", { name: "เมนูผู้ดูแล" });
    await navigation.getByRole("button").filter({ hasText: "รายงาน" }).click();
    await expect(
      page.getByRole("heading", { name: "ประวัติรายงานจากผู้ใช้", level: 1 }),
    ).toBeVisible();
    await capture(page, "19-admin-ocr-exceptions.png");

    await navigation.getByRole("button").filter({ hasText: "ประกาศ" }).click();
    await expect(
      page.getByRole("heading", { name: "ประกาศและกิจกรรม" }),
    ).toBeVisible();
    await capture(page, "20-admin-announcements.png");

    await navigation.getByRole("button").filter({ hasText: "ระบบ" }).click();
    await expect(
      page.getByRole("heading", { name: "สถานะข้อมูลและบริการ" }),
    ).toBeVisible();
    await capture(page, "21-admin-system-health.png");
  });
});
