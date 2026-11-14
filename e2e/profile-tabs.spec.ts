import { expect, test } from "@playwright/test";

const sections = [
  ["overview", "ภาพรวม", ".cp-xp-profile"],
  ["reports", "รายงานของฉัน", ".cp-contribution"],
  ["leaderboard", "อันดับชุมชน", ".cp-xp-board"],
] as const;

for (const [tab, , panel] of sections) {
  test(`profile ${tab} deep link loads, switches tabs and preserves its return`, async ({
    page,
  }) => {
    await page.goto(`/profile?returnTo=%2Fair&tab=${tab}`);
    await expect(page.locator(panel)).toBeVisible();
    const nav = page.getByRole("navigation", {
      name: "ผลงานและอันดับ",
      exact: true,
    });
    for (const [value, label, selector] of sections) {
      await nav.getByRole("button", { name: label, exact: true }).click();
      await expect(
        nav.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(selector)).toBeVisible();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("tab"))
        .toBe(value);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/air");
    }
    await page.reload();
    await expect(page.locator(".cp-xp-board")).toBeVisible();
    await page
      .getByRole("link", { name: "ปิดการตั้งค่า", exact: true })
      .click();
    await expect(page).toHaveURL(/\/air$/);
  });
}

for (const [tab, endpoint, message, panel] of [
  [
    "overview",
    "**/api/community/me/xp?details=false",
    "โหลดคะแนนไม่สำเร็จ",
    ".cp-xp-profile",
  ],
  [
    "reports",
    "**/api/community/me/reports",
    "โหลดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง",
    ".cp-contribution",
  ],
  [
    "leaderboard",
    "**/api/community/me/leaderboard?*",
    "โหลดอันดับไม่สำเร็จ",
    ".cp-xp-leaders",
  ],
]) {
  test(`profile ${tab} offers retry after a data failure`, async ({ page }) => {
    let fail = true;
    await page.route(endpoint, (route) =>
      fail
        ? route.fulfill({ status: 503, json: { detail: "temporary" } })
        : route.continue(),
    );
    await page.goto(`/profile?returnTo=%2Fair&tab=${tab}`);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
    await expect(page.locator(panel)).toBeAttached();
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
  });
}

test("profile tabs and cached revisits work without a server navigation", async ({
  page,
}) => {
  await page.goto("/profile?returnTo=%2Fair&tab=overview");
  await expect(page.locator(".cp-xp-profile")).toBeVisible();
  let serverNavigations = 0;
  await page.route("**/profile?*", (route) => {
    if (route.request().headers()["rsc"] === "1") {
      serverNavigations++;
      return route.abort("failed");
    }
    return route.continue();
  });
  const nav = page.getByRole("navigation", {
    name: "ผลงานและอันดับ",
    exact: true,
  });
  for (const [tab, label, panel] of [...sections, ...sections, ...sections]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await expect(
      nav.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(panel)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("tab")).toBe(tab);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/air");
  }
  expect(serverNavigations).toBe(0);
});
