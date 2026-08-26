import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", text: "คุณภาพอากาศทั่วไทย" },
  { path: "/air", text: "อากาศวันนี้" },
  { path: "/report", text: "ส่งข้อมูลจากเครื่องวัด" },
  { path: "/community", text: "ช่วยกันทำให้ข้อมูลอากาศดีขึ้น" },
  { path: "/admin", text: "เข้าสู่ระบบผู้ดูแล" },
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
  await expect(page.getByText(/สีหลักและรูปทรงบอกเจ้าของข้อมูล/)).toBeVisible();
});

test("community marker opens a distinct privacy-safe report card", async ({
  page,
}) => {
  await page.route("**/api/community/reports", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        reports: [
          {
            id: "community-map-demo",
            display_name: "สมาชิกชุมชน",
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
  await page.goto("/air?station=81t");
  const largeText = page.getByRole("button", {
    name: "สลับขนาดตัวอักษรใหญ่",
  });
  const contrast = page.getByRole("button", {
    name: "สลับโหมดคอนทราสต์สูง",
  });
  await largeText.click();
  await contrast.click();
  await expect(largeText).toHaveAttribute("aria-pressed", "true");
  await expect(contrast).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cp-app")).toHaveAttribute(
    "data-contrast",
    "true",
  );
  const state = await page.locator(".cp-app").evaluate((root) => ({
    fontSize: getComputedStyle(root).fontSize,
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(state.fontSize).toBe("18px");
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
