import { expect, test } from "@playwright/test";

test("nearby user reports share a marker and preserve each photo/detail", async ({
  page,
}) => {
  const now = new Date();
  const reports = [
    { id: "near-a", user_id: "alice", display_name: "กานต์", pm25: 20 },
    { id: "near-b", user_id: "bob", display_name: "มินตรา", pm25: 24 },
    { id: "near-c", user_id: "alice", display_name: "กานต์", pm25: 18 },
  ].map((entry, index) => ({
    ...entry,
    lat: 13.82,
    lon: 100.06,
    status: "approved",
    source_type: "individual",
    show_reporter_profile: true,
    captured_at: new Date(
      now.getTime() - (10 + index * 5) * 60_000,
    ).toISOString(),
    age_minutes: 10 + index * 5,
    location_precision_m: 180,
    verification_method: "automatic",
    image_url: `https://example.com/${entry.id}.svg`,
    province: "นครปฐม",
    district: "เมืองนครปฐม",
    subdistrict: "พระปฐมเจดีย์",
  }));
  await page.route("https://example.com/*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#477c72"/></svg>',
    }),
  );
  await page.route("**/api/community/reports", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        reports,
        count: reports.length,
        stacks: [
          {
            id: "stack:near-a",
            lat: 13.82,
            lon: 100.06,
            report_ids: reports.map((report) => report.id),
            report_count: 3,
            reporter_count: 2,
            latest_captured_at: reports[0].captured_at,
            pm25: 22,
            value_status: "average",
            contributing_count: 2,
            contributing_report_ids: ["near-a", "near-b"],
          },
        ],
      }),
    }),
  );

  await page.goto("/");
  const marker = page.locator(".cp-marker--report-stack");
  await expect(marker).toHaveCount(1);
  await expect(page.locator(".cp-marker--individual")).toHaveCount(0);
  await marker.click();
  await expect(marker.locator(".cp-report-stack-marker")).toHaveClass(
    /is-selected/,
  );
  const card = page.getByRole("region", {
    name: "รายงานค่าฝุ่นในบริเวณเดียวกัน",
  });
  await expect(
    card.getByRole("heading", { name: "3 รายงานจาก 2 คน" }),
  ).toBeVisible();
  await expect(
    card.getByText("ค่าเฉลี่ยจาก 2 คนใน 60 นาทีล่าสุด"),
  ).toBeVisible();
  await expect(card.getByText("ใช้ในค่าเฉลี่ย")).toHaveCount(2);
  await expect(card.locator(".cp-report-stack-card__item")).toHaveCount(3);
  await card.getByRole("button", { name: /มินตรา/ }).click();
  const detail = page.getByRole("region", {
    name: "รายละเอียดรายงานจากบุคคล",
  });
  await expect(detail.getByText("24")).toBeVisible();
  await expect(detail.getByRole("region", { name: "ผู้รายงาน" })).toHaveCount(
    0,
  );
  await detail
    .getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" })
    .click();
  await expect(
    detail.getByRole("button", { name: "เปิดดูภาพเครื่องวัดจากรายงานนี้" }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "เปิดดูภาพเครื่องวัดจากรายงานนี้" })
    .click();
  const photoDialog = page.getByRole("dialog", {
    name: "ภาพเครื่องวัดจากรายงานนี้",
  });
  await expect(photoDialog).toBeVisible();
  await expect(
    photoDialog.getByRole("img", {
      name: "ภาพเครื่องวัด PM2.5 ฉบับเต็มจากผู้รายงาน",
    }),
  ).toHaveAttribute("src", "https://example.com/near-b.svg");
  await photoDialog.getByRole("button", { name: "ปิดภาพเครื่องวัด" }).click();
  await expect(photoDialog).not.toBeVisible();
  await expect(
    detail.getByRole("region", { name: "ข้อมูลรายงานค่าฝุ่น" }),
  ).toBeVisible();
  await expect(detail.getByRole("region", { name: "ผู้รายงาน" })).toBeVisible();
  await detail.getByRole("button", { name: "กลับไปยังกลุ่มรายงาน" }).click();
  await expect(card).toBeVisible();
  const widths = await page.evaluate(() => [
    window.innerWidth,
    document.documentElement.scrollWidth,
  ]);
  expect(widths[1]).toBeLessThanOrEqual(widths[0]);
  await page.screenshot({ path: "test-results/report-stack-mobile.png" });
});

test("local demo report opens as a compact card before full details", async ({
  page,
}) => {
  await page.goto("/?demo=community");
  const marker = page.locator(".cp-marker--individual").first();
  await expect(marker).toBeVisible();
  await marker.click();

  const card = page.getByRole("region", { name: "รายละเอียดรายงานจากบุคคล" });
  await expect(card).toHaveAttribute("data-expanded", "false");
  await expect(card.getByText("ข้อมูลตัวอย่าง")).toBeVisible();
  const compactHeight = await card.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(compactHeight).toBeLessThan(220);
  await page.screenshot({
    path: "test-results/demo-report-compact-mobile.png",
  });

  await card
    .getByRole("button", { name: "ดูรายละเอียดรายงานและผู้รายงาน" })
    .click();
  await expect(card).toHaveAttribute("data-expanded", "true");
  await expect(card.getByRole("region", { name: "ผู้รายงาน" })).toBeVisible();
  await expect(
    card.getByRole("region", { name: "ข้อมูลรายงานค่าฝุ่น" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/demo-report-detail-mobile.png" });
  await card.getByRole("button", { name: /กลับไปแผนที่/ }).click();
  await expect(card).toHaveAttribute("data-expanded", "false");
});
