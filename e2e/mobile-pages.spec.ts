import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createPendingReport } from "./support/community-report";

const pages = [
  { path: "/", text: "คุณภาพอากาศทั่วไทย" },
  { path: "/air", text: "อากาศวันนี้" },
  { path: "/report", text: "ส่งข้อมูลจากเครื่องวัด" },
  { path: "/community", text: "ข่าวสารล่าสุด" },
  { path: "/settings", text: "การแสดงผล" },
  { path: "/profile", text: "โปรไฟล์ของฉัน" },
  { path: "/admin", text: "ศูนย์ควบคุม ClearPath" },
  { path: "/offline", text: "ขณะนี้ไม่ได้เชื่อมต่ออินเทอร์เน็ต" },
];

async function expectNoHorizontalPageOverflow(
  page: import("@playwright/test").Page,
) {
  const state = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          element.closest(".leaflet-pane, .leaflet-control-container")
        ) {
          return false;
        }
        let ancestor = element.parentElement;
        while (ancestor) {
          const overflowX = window.getComputedStyle(ancestor).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return false;
          ancestor = ancestor.parentElement;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewport + 1);
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));

    return { viewport, documentWidth, offenders };
  });

  expect(
    state.documentWidth,
    `horizontal overflow: ${JSON.stringify(state.offenders)}`,
  ).toBeLessThanOrEqual(state.viewport);
  expect(
    state.offenders,
    `elements clipped outside viewport: ${JSON.stringify(state.offenders)}`,
  ).toEqual([]);
}

for (const item of pages) {
  test(`${item.path} is mobile-safe and has no serious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(item.path);
    await expect(
      page.getByText(item.text, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.locator("nextjs-portal")).toHaveCount(0);

    await expectNoHorizontalPageOverflow(page);

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

test("admin exposes only the active operational surfaces", async ({ page }) => {
  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { name: "สิ่งที่ต้องดูแลวันนี้" }),
  ).toBeVisible();
  await expect(page.getByText("โมเดลพยากรณ์")).toHaveCount(0);

  const adminNavigation = page.getByRole("navigation", {
    name: "เมนูผู้ดูแล",
  });
  await adminNavigation
    .getByRole("button", { name: "ระบบ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ข้อมูลและบริการที่ต้องดูแล" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ข้อมูล PM2.5 จาก Air4Thai" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "การส่งแจ้งเตือน" }),
  ).toBeVisible();
  await expect(page.getByText("โมเดลพยากรณ์")).toHaveCount(0);
  await expect(page.getByText("false-safe")).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);

  await adminNavigation
    .getByRole("button", { name: "OCR", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "ตรวจเฉพาะหลักฐานที่ไม่ผ่านเกณฑ์อัตโนมัติ",
    }),
  ).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});

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

test("profile leaderboard shows a clear weekly rank without trust scores", async ({
  page,
}) => {
  await page.route("**/api/community/leaderboard", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        users: [
          {
            user_id: "helper-1",
            display_name: "ผู้ช่วยนครปฐม",
            rank: 1,
            weekly_points: 42,
            badges: ["นักรายงานที่ยืนยันแล้ว"],
          },
        ],
      }),
    });
  });
  await page.goto("/profile");
  await page.getByText("กิจกรรมและอันดับ", { exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "ผู้ช่วยชุมชนประจำสัปดาห์" }),
  ).toBeVisible();
  await expect(page.getByText("ผู้ช่วยนครปฐม", { exact: true })).toBeVisible();
  await expect(page.getByLabel("อันดับ 1")).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  const leaderboard = page.getByRole("region", {
    name: "ผู้ช่วยชุมชนประจำสัปดาห์",
  });
  await expect(leaderboard.getByText(/Trust|ความน่าเชื่อถือ/i)).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);
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
  await expect(
    page.getByRole("switch", { name: /ลดการเคลื่อนไหว/ }),
  ).toBeVisible();
});

test("news page prioritizes announcements and moves settings elsewhere", async ({
  page,
}) => {
  await page.route("**/api/community/announcements", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        announcements: [
          {
            id: "google-news-1",
            title: "ข่าว PM2.5 ล่าสุด",
            body: "เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ",
            kind: "news",
            area: "ประเทศไทย",
            published_at: "2026-09-17T08:00:00+00:00",
            expires_at: null,
            status: "published",
            image_url: null,
            source_name: "Thai News",
            source_url: "https://news.google.com/rss/articles/example",
            external: true,
            created_at: null,
            updated_at: null,
          },
        ],
      }),
    });
  });
  await page.goto("/community");

  await expect(
    page.getByRole("heading", { name: "ข่าวสารล่าสุด" }),
  ).toBeVisible();
  const sourceLink = page.getByRole("link", { name: "อ่านจาก Thai News" });
  await expect(sourceLink).toHaveAttribute(
    "href",
    "https://news.google.com/rss/articles/example",
  );
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: /การแจ้งเตือน/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /ส่งข้อมูลค่าฝุ่น/ }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "เมนูหลักบนมือถือ" })
      .getByRole("link", { name: "ข่าวสาร" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("ภาพรวม", { exact: true })).toHaveCount(0);
  await expect(page.getByText("เพิ่มเติม", { exact: true })).toHaveCount(0);
  await expect(page.getByText("กิจกรรมและอันดับ", { exact: true })).toHaveCount(
    0,
  );
});

test("non-map pages do not load map-only data", async ({ page }) => {
  const requestedPaths = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requestedPaths.add(url.pathname);
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "การแสดงผล" })).toBeVisible();
  await page.waitForTimeout(250);

  for (const path of [
    "/api/pm25/current",
    "/api/firms",
    "/api/community/map-points",
    "/api/community/reports",
  ]) {
    expect(requestedPaths.has(path), `${path} should stay map-scoped`).toBe(
      false,
    );
  }
});

test("map defers satellite hotspot data until its layer is enabled", async ({
  page,
}) => {
  const requestedPaths = new Set<string>();
  page.on("request", (request) => {
    requestedPaths.add(new URL(request.url()).pathname);
  });

  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "เลือกข้อมูลที่แสดงบนแผนที่",
    }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  expect(requestedPaths.has("/api/firms")).toBe(false);

  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
    .click();
  const hotspotRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/firms",
  );
  await page.getByRole("button", { name: /จุดความร้อนจากดาวเทียม/ }).click();
  await hotspotRequest;
});

test("satellite hotspot fixture is distinct and never presented as a confirmed fire", async ({
  page,
}) => {
  const acquiredAt = new Date(Date.now() - 60 * 60_000).toISOString();
  await page.route("**/api/firms?*", async (route) => {
    await route.fulfill({
      json: {
        fires: [
          {
            id: "firms-positive-fixture",
            lat: 13.82,
            lon: 100.06,
            frp: 25,
            bright: 330,
            daynight: "D",
            acq_date: acquiredAt.slice(0, 10),
            acquired_at: acquiredAt,
            confidence: "h",
            satellite: "VIIRS_NOAA20_NRT",
            source_products: ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT"],
          },
        ],
        count: 1,
        available: true,
        status: "available",
        checked_at: new Date().toISOString(),
        latest_acquired_at: acquiredAt,
        max_age_hours: 12,
        message: null,
        source: "nasa_firms",
      },
    });
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
    .click();
  await page.getByRole("button", { name: /จุดความร้อนจากดาวเทียม/ }).click();
  await page
    .getByRole("button", { name: /สถานีตรวจวัดทางการ Air4Thai/ })
    .click();
  await page.getByRole("button", { name: "ปิดตัวเลือกข้อมูล" }).click();

  const marker = page.locator('[title^="จุดความร้อนจากดาวเทียม"]');
  await expect(marker).toBeVisible();
  await marker.click();
  const popup = page.locator(".leaflet-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("จุดความร้อนจากดาวเทียม");
  await expect(popup).toContainText("ไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว");
});

test("news page loads no map, rewards, or leaderboard data by default", async ({
  page,
}) => {
  const requestedPaths = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requestedPaths.add(url.pathname);
  });

  await page.goto("/community");
  await expect(
    page.getByRole("heading", { name: "ประกาศสำคัญ" }),
  ).toBeVisible();
  await page.waitForTimeout(250);

  for (const path of [
    "/api/pm25/current",
    "/api/firms",
    "/api/community/map-points",
    "/api/community/reports",
    "/api/community/activities",
    "/api/community/leaderboard",
  ]) {
    expect(
      requestedPaths.has(path),
      `${path} should be lazy or map-scoped`,
    ).toBe(false);
  }
});

test("air summary automatically uses the current GPS position", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for geolocation tests");
  }
  await context.grantPermissions(["geolocation"], {
    origin: new URL(baseURL).origin,
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
  await page.goto("/settings/notifications");
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
  await page.goto("/settings/notifications");

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
  await expect(page.getByText("ช่องทางและช่วงไม่รบกวน")).toBeVisible();
  await expect(page.getByLabel("เริ่มไม่รบกวน")).toHaveValue("22:00");
  await expect(page.getByLabel("กลับมาแจ้งเตือน")).toHaveValue("07:00");
  await expect(
    page.getByText("ยินยอมรับการแจ้งเตือนตามเงื่อนไขนี้"),
  ).toBeVisible();
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

  await page.goto("/settings/notifications");
  await page.getByRole("button", { name: "สร้างรหัสเชื่อมบัญชี" }).click();
  await expect(page.getByText("CP-ABCD2345", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "คัดลอกรหัส" })).toBeVisible();
  await expect(page.getByText("หมดอายุใน", { exact: false })).toBeVisible();
});

test("mobile camera opens, becomes ready and captures a live frame @camera-390", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const devices = ["back-camera", "front-camera"].map((deviceId) => ({
      deviceId,
      groupId: "clearpath-e2e",
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
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(
    page.getByText("กล้องหลังพร้อมแล้ว ถือเครื่องให้นิ่ง", { exact: false }),
  ).toBeVisible();
  const switchCamera = page.getByRole("button", {
    name: "สลับเป็นกล้องหน้า",
  });
  await expect(switchCamera).toBeVisible();
  await switchCamera.click();
  await expect(
    page.getByText("กล้องหน้าพร้อมแล้ว", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "สลับเป็นกล้องหลัง" }),
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

test("map separates official stations from individual reports", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
    .click();

  const panel = page.locator("#cp-map-layers-panel");
  const official = panel.getByRole("button", {
    name: /สถานีตรวจวัดทางการ/,
  });
  const community = panel.getByRole("button", {
    name: /รายงานจากบุคคล/,
  });
  await expect(official).toBeVisible();
  await expect(community).toBeVisible();
  await expect(official).toHaveAttribute("aria-pressed", "true");
  await expect(community).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("button", { name: /สถานีเซนเซอร์ชุมชน/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/สีหมุดบอกระดับ PM2.5.*ไอคอนบอกเจ้าของข้อมูล/),
  ).toBeVisible();
});

test("community marker opens a distinct privacy-safe report card", async ({
  page,
}) => {
  let likeCount = 4;
  const engagement = () => ({
    like_count: likeCount,
    dislike_count: 1,
    comment_count: 0,
    viewer_reaction: likeCount > 4 ? "like" : null,
    comments: [],
  });
  await page.route("https://lh3.googleusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route(
    "**/api/community/reports/community-map-demo/engagement**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(engagement()),
      });
    },
  );
  await page.route(
    "**/api/community/reports/community-map-demo/reaction",
    async (route) => {
      likeCount = 5;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(engagement()),
      });
    },
  );
  await page.route(
    "**/api/community/reports/community-map-demo/comments",
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "comment-e2e",
          report_id: "community-map-demo",
          user_id: "local-user",
          display_name: "ผู้ทดสอบ",
          avatar_url: null,
          body: "ข้อมูลมีประโยชน์",
          created_at: new Date().toISOString(),
          is_own: true,
        }),
      });
    },
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
            like_count: 4,
            dislike_count: 1,
            comment_count: 0,
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
  await marker.click({ force: true });

  const card = page.getByRole("region", {
    name: "รายละเอียดรายงานจากบุคคล",
  });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Trust/i)).toHaveCount(0);
  await expect(card.getByText("รายงานจากบุคคล", { exact: true })).toBeVisible();
  await expect(card.getByText(/ผู้รายงาน สมาชิกชุมชน/)).toBeVisible();
  await expect(card.getByText(/สอบเทียบ/)).toBeVisible();
  await expect(card.getByText(/พิกัดจริงประมาณ 180 ม./)).toBeVisible();
  const like = card.getByRole("button", { name: /ถูกใจ 4/ });
  await expect(like).toBeVisible();
  await like.click();
  await expect(card.getByRole("button", { name: /ถูกใจ 5/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await card.getByRole("button", { name: /ความคิดเห็น 0/ }).click();
  await card.getByLabel("เขียนความคิดเห็น").fill("ข้อมูลมีประโยชน์");
  await card.getByRole("button", { name: "ส่งความคิดเห็น" }).click();
  await expect(
    card.getByText("ข้อมูลมีประโยชน์", { exact: true }),
  ).toBeVisible();
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
  await expectNoHorizontalPageOverflow(page);
});

test("core pages reflow at 200 percent text without clipping", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-320");
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });

  for (const item of pages.filter(({ path }) => path !== "/offline")) {
    await page.goto(item.path);
    await expect(
      page.getByText(item.text, { exact: false }).first(),
    ).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  }
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

test("admin triages a data issue and sees its audit trail @stateful-360", async ({
  page,
  request,
}) => {
  const message = `E2E ตรวจเวลาสถานีผิดปกติ ${Date.now()}`;
  const created = await request.post("/api/community/data-issues", {
    data: {
      category: "station",
      reference_id: "station-e2e",
      message,
    },
  });
  expect(created.status()).toBe(201);

  await page.goto("/admin");
  await page.getByRole("button", { name: /ข้อมูลและโมเดล|ระบบ/ }).click();
  const issue = page
    .locator(".cp-admin-issue-row")
    .filter({ hasText: message });
  await expect(issue).toBeVisible();
  await issue.getByLabel("สถานะถัดไป").selectOption("resolved");
  await issue
    .getByLabel("ผลตรวจและเหตุผล")
    .fill("ตรวจข้อมูลสถานีต้นทางและแก้ไขรายการเรียบร้อยแล้ว");
  await issue.getByRole("button", { name: "บันทึกผลตรวจ" }).click();

  await expect(issue.getByText("แก้ไขแล้ว")).toBeVisible();
  await expect(page.getByText("data_issue_transitioned").first()).toBeVisible();
});

test("admin approves and rejects exception reports with evidence @stateful-360", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const approved = await createPendingReport(request, {
    deviceModel: `Approve Meter ${suffix}`,
    pm25: 38.4,
  });
  const rejected = await createPendingReport(request, {
    deviceModel: `Reject Meter ${suffix}`,
    pm25: 91.2,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /ข้อยกเว้น OCR|OCR/ }).click();

  const approveCard = page
    .locator(".cp-admin-report-card")
    .filter({ hasText: `Approve Meter ${suffix}` });
  await expect(approveCard).toBeVisible();
  for (const checkbox of await approveCard.getByRole("checkbox").all()) {
    await checkbox.check();
  }
  await approveCard.getByLabel("ค่า PM2.5 ที่ Admin อ่านจากภาพ").fill("39.1");
  await approveCard
    .getByLabel(/ผลตรวจและเหตุผล/)
    .fill("ตรวจภาพ ตำแหน่ง เวลา และค่าบนหน้าจอครบแล้ว");
  await approveCard.getByRole("button", { name: "อนุมัติค่าที่กรอก" }).click();
  await expect(approveCard).toHaveCount(0);

  const rejectCard = page
    .locator(".cp-admin-report-card")
    .filter({ hasText: `Reject Meter ${suffix}` });
  await expect(rejectCard).toBeVisible();
  await rejectCard
    .getByLabel("เหตุผลเมื่อปฏิเสธ")
    .selectOption("image_unclear");
  await rejectCard
    .getByLabel(/ผลตรวจและเหตุผล/)
    .fill("ตัวเลขบนหน้าจอไม่ชัดพอสำหรับยืนยันค่า");
  await rejectCard.getByRole("button", { name: "ปฏิเสธ" }).click();
  await expect(rejectCard).toHaveCount(0);

  const publicReports = await request.get("/api/community/reports");
  expect(publicReports.status()).toBe(200);
  const rows = (await publicReports.json()).reports as Array<{
    id: string;
    pm25: number;
  }>;
  expect(rows.find((row) => row.id === approved.id)?.pm25).toBe(39.1);
  expect(rows.some((row) => row.id === rejected.id)).toBe(false);
});

test("admin manages the complete announcement lifecycle @stateful-360", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `ประกาศทดสอบ ${suffix}`;
  const editedTitle = `${title} แก้ไขแล้ว`;

  await page.goto("/admin");
  await page.getByRole("button", { name: /ประกาศ/ }).click();
  const form = page.locator("form").filter({ hasText: "สร้างประกาศชุมชน" });
  await form.getByLabel("หัวข้อประกาศ").fill(title);
  await form
    .getByLabel("รายละเอียด")
    .fill("ข้อมูลทดสอบวงจรประกาศสำหรับผู้ใช้งาน ClearPath");
  await form.getByLabel("ประเภท").selectOption("news");
  await form.getByLabel("พื้นที่").fill("นครปฐม");
  await form.getByLabel("สถานะ").selectOption("draft");
  await form
    .getByLabel(/ภาพประกอบ/)
    .setInputFiles("docs/assets/ui-archive/clearpath-mobile-final.png");
  await form.getByRole("button", { name: "บันทึกประกาศ" }).click();

  let row = page
    .locator(".cp-admin-announcement-row")
    .filter({ hasText: title });
  await expect(row.getByText(/ฉบับร่าง/)).toBeVisible();
  await row.getByRole("button", { name: "แก้ไข" }).click();
  const editForm = page.locator("form").filter({ hasText: "แก้ไขประกาศ" });
  await editForm.getByLabel("หัวข้อประกาศ").fill(editedTitle);
  await editForm.getByRole("button", { name: "บันทึกการแก้ไข" }).click();

  row = page
    .locator(".cp-admin-announcement-row")
    .filter({ hasText: editedTitle });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "เผยแพร่", exact: true }).click();
  await expect(row.getByText(/เผยแพร่แล้ว/)).toBeVisible();
  await row.getByRole("button", { name: "ยกเลิกเผยแพร่" }).click();
  await expect(row.getByText(/ฉบับร่าง/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "เก็บออกจากรายการ" }).click();
  await expect(row.getByText(/เก็บแล้ว/)).toBeVisible();
});
