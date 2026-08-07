import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", text: "ภาพรวมนครปฐม" },
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
