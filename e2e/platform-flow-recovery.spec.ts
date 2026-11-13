import { expect, test } from "@playwright/test";

for (const origin of ["/", "/air", "/report", "/community"]) {
  test(`admin menu exits back to ${origin} after every read-only tab`, async ({
    page,
  }) => {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "เปิดโปรไฟล์", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "โปรไฟล์", exact: true })
      .getByRole("link", { name: "ภาพรวมผู้ดูแล", exact: true })
      .click();
    const close = page.getByRole("link", {
      name: "กลับไปหน้าก่อนหน้า",
      exact: true,
    });
    await expect(close).toHaveAttribute("href", origin);
    const nav = page.getByRole("navigation", { name: "เมนูผู้ดูแล" });
    for (const tab of [/รายงาน/, /ประกาศ/, /ระบบ/, /ภาพรวม/]) {
      await nav.getByRole("button", { name: tab }).click();
      await expect(close).toHaveAttribute("href", origin);
    }
    await page.reload();
    await expect(close).toHaveAttribute("href", origin);
    await close.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(origin);
  });
}

test("member load failure offers retry and both exits return to its leaderboard", async ({
  page,
}) => {
  await page.route("**/api/community/me/leaderboard?*", (route) =>
    route.fulfill({
      json: {
        period: "month",
        policy_version: "contribution-v3",
        users: [
          {
            member_id: "MBR-FLOW",
            alias: "สมาชิกทดสอบ flow",
            xp: 42,
            title: {
              code: "reporter",
              label: "ผู้รายงานชุมชน",
              minimum_xp: 100,
              minimum_days: 0,
              next_xp: 500,
              next_label: "ผู้ร่วมดูแล",
              next_days: 0,
            },
          },
        ],
        me: null,
        next_offset: null,
      },
    }),
  );
  let attempts = 0;
  await page.route("**/api/community/members/MBR-FLOW", (route) => {
    attempts++;
    return route.fulfill({
      status: 503,
      json: { detail: "ทดสอบโหลดไม่สำเร็จ" },
    });
  });
  await page.goto("/profile?tab=leaderboard");
  await page.getByRole("link", { name: /สมาชิกทดสอบ flow/ }).click();
  await expect(
    page.getByRole("button", { name: "ลองโหลดสมาชิกอีกครั้ง" }),
  ).toBeVisible();
  const count = attempts;
  await page.getByRole("button", { name: "ลองโหลดสมาชิกอีกครั้ง" }).click();
  await expect.poll(() => attempts).toBeGreaterThan(count);
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?tab=leaderboard$/);
  await page.getByRole("link", { name: /สมาชิกทดสอบ flow/ }).click();
  await page.getByRole("link", { name: "ปิดการตั้งค่า", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?tab=leaderboard$/);
});

for (const path of ["/requests", "/requests/REQ-RETRY"]) {
  test(`failed request data at ${path} can retry immediately and exit`, async ({
    page,
  }) => {
    let attempts = 0;
    await page.route(
      `**/api/measurement-requests${path === "/requests" ? "" : "/REQ-RETRY"}`,
      (route) => {
        attempts++;
        return route.fulfill({
          status: 503,
          json: { detail: "ทดสอบโหลดคำขอล้มเหลว" },
        });
      },
    );
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "ลองโหลดคำขออีกครั้ง" }),
    ).toBeVisible();
    const count = attempts;
    await page.getByRole("button", { name: "ลองโหลดคำขออีกครั้ง" }).click();
    await expect.poll(() => attempts).toBeGreaterThan(count);
    await expect(
      page.getByRole("button", { name: "ลองโหลดคำขออีกครั้ง" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "← กลับ", exact: true }).click();
    await expect(page).toHaveURL(path === "/requests" ? /\/$/ : /\/requests$/);
  });
}

test("station list owns its controls, sort and selection then returns to the map", async ({
  page,
}) => {
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        stations: [10, 30].map((pm25, index) => ({
          id: `FLOW-${index}`,
          name_th: `สถานี flow ${pm25}`,
          lat: 13.82 + index * 0.01,
          lon: 100.06,
          pm25,
          recorded_at: new Date().toISOString(),
          data_status: "fresh",
          eligible_for_surface: true,
          in_service_area: true,
        })),
      },
    }),
  );
  await page.goto("/");
  const layers = page.getByRole("button", {
    name: "เลือกข้อมูลที่แสดงบนแผนที่",
    exact: true,
  });
  await layers.click();
  await page
    .getByRole("button", { name: "ดูรายการสถานี", exact: true })
    .click();
  const list = page.locator(".cp-list-view");
  await expect(
    list.getByRole("button", { name: "กลับไปแผนที่", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".cp-map-topbar")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toHaveCount(0);
  await list.getByRole("button", { name: "ฝุ่นมากสุด", exact: true }).click();
  await expect(list.getByRole("listitem").first()).toContainText(
    "สถานี flow 30",
  );
  await list.getByRole("button", { name: /สถานี flow 30.*PM2.5/ }).click();
  await expect(list).toHaveCount(0);
  await expect(page.locator(".cp-station-sheet")).toContainText(
    "สถานี flow 30",
  );
  await layers.click();
  await page
    .getByRole("button", { name: "ดูรายการสถานี", exact: true })
    .click();
  await list.getByRole("button", { name: "กลับไปแผนที่", exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }),
  ).toBeVisible();
});

test("request context on reporting can retry without losing its exit", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/measurement-requests/REQ-CONTEXT", (route) => {
    attempts++;
    return route.fulfill({
      status: 503,
      json: { detail: "ทดสอบโหลดบริบทคำขอล้มเหลว" },
    });
  });
  await page.goto("/report?request=REQ-CONTEXT");
  const retry = page.getByRole("button", {
    name: "ลองโหลดรายละเอียดคำขออีกครั้ง",
  });
  await expect(retry).toBeVisible();
  const count = attempts;
  await retry.click();
  await expect.poll(() => attempts).toBeGreaterThan(count);
  await expect(retry).toBeVisible();
  await page
    .getByRole("navigation", { name: "เมนูหลักบนมือถือ" })
    .getByRole("link", { name: "แผนที่", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
});

test("help reporting entered from a request list does not create a Back cycle", async ({
  page,
}) => {
  const row = {
    id: "REQ-LIST-HELP",
    is_owner: false,
    status: "active",
    place_name: "พื้นที่ทดสอบทางกลับ",
    lat: 13.82,
    lon: 100.06,
    radius_km: 2,
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    created_at: new Date().toISOString(),
    recipient_count: 1,
    xp_enabled: false,
  };
  await page.route("**/api/measurement-requests", (route) =>
    route.fulfill({ json: { requests: [row] } }),
  );
  await page.route("**/api/measurement-requests/REQ-LIST-HELP", (route) =>
    route.fulfill({ json: row }),
  );
  await page.goto("/requests");
  await page.getByRole("link", { name: "รายละเอียดคำขอ", exact: true }).click();
  await page
    .getByRole("button", { name: "ช่วยรายงานค่าฝุ่น", exact: true })
    .click();
  await expect(page).toHaveURL(/\/report\?request=REQ-LIST-HELP$/);
  await page.getByRole("link", { name: "ดูสถานะคำขอ", exact: true }).click();
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
