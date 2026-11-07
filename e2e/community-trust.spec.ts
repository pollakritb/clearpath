import { expect, test } from "@playwright/test";

test("community assessment requires evidence, reuses a retry key and explains non-Trust reasons", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 13.7367,
    longitude: 100.5231,
    accuracy: 10,
  });
  const report = {
    id: "community-trust-demo",
    user_id: "different-account",
    display_name: "ผู้รายงานทดสอบ",
    show_reporter_profile: true,
    member_id: "MBR-000001",
    lat: 13.7367,
    lon: 100.5231,
    pm25: 34,
    trust_score: 70,
    verification_method: "automatic",
    age_minutes: 10,
    location_precision_m: 180,
    source_type: "individual",
    image_url: "https://lh3.googleusercontent.com/community-trust-meter.svg",
    status: "approved",
    captured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    is_fresh: true,
    like_count: 0,
    dislike_count: 0,
    comment_count: 0,
    community_trust: {
      policy_version: "community-trust-v1",
      status: "insufficient",
      score: null,
      unique_voter_accounts: 0,
      evaluated_report_count: 0,
      evaluated_day_count: 0,
    },
  };
  let reaction: string | null = null,
    attempt = 0;
  const keys: string[] = [];
  const state = () => ({
    community_trust_collecting: true,
    location_required: true,
    location_policy_ready: true,
    reaction_radius_m: 500,
    viewer_reaction: reaction,
    like_count: reaction === "like" ? 1 : 0,
    dislike_count: reaction === "dislike" ? 1 : 0,
    comment_count: 0,
    comments: [],
  });
  await page.route("**/api/community/reports", (r) =>
    r.fulfill({ json: { reports: [report], stacks: [], count: 1 } }),
  );
  await page.route("**/api/community/reports/community-trust-demo", (r) =>
    r.fulfill({ json: report }),
  );
  await page.route(
    "https://lh3.googleusercontent.com/community-trust-meter.svg",
    (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="200"><rect width="240" height="200" fill="#203e38"/><text x="55" y="130" fill="white" font-size="80">34</text></svg>',
      }),
  );
  await page.route(
    "**/api/community/reports/community-trust-demo/engagement**",
    (r) => r.fulfill({ json: state() }),
  );
  await page.route(
    "**/api/community/reports/community-trust-demo/reaction**",
    async (r) => {
      if (r.request().method() === "DELETE") {
        reaction = null;
        await r.fulfill({ json: state() });
        return;
      }
      const body = r.request().postDataJSON();
      keys.push(body.request_key);
      expect(body.trust_policy_version).toBe("community-trust-v1");
      expect(body.location.accuracy_m).toBeGreaterThanOrEqual(0);
      attempt++;
      if (attempt === 1) {
        await r.fulfill({ status: 503, json: { detail: "retry test" } });
        return;
      }
      reaction = body.reaction;
      await r.fulfill({
        json: {
          ...state(),
          trust_eligible: body.reason_code !== "ocr_mismatch",
          trust_exclusion_reason:
            body.reason_code === "ocr_mismatch" ? "reason_not_trust" : null,
        },
      });
    },
  );
  await page.goto("/");
  await page.locator('[title^="รายงานจากบุคคล"]').click();
  const grips = page.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
  await grips.last().press("End");
  const like = page.getByRole("button", { name: /^ถูกใจ/ });
  await expect(like).toBeEnabled();
  await like.click();
  await expect(
    page.getByRole("alert").filter({ hasText: /retry test|ส่งปฏิกิริยา/ }),
  ).toBeVisible();
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  expect(keys[0]).toBe(keys[1]);
  await page.getByRole("button", { name: /^ไม่ถูกใจ/ }).click();
  await page.getByLabel("เหตุผลเมื่อไม่ถูกใจ").selectOption("ocr_mismatch");
  await page
    .getByRole("button", { name: /ส่ง.*ไม่ถูกใจ|ยืนยัน.*ไม่ถูกใจ|ส่งเหตุผล/ })
    .click();
  await expect(
    page.getByText(/เหตุผลนี้เกี่ยวกับระบบหรือยังประเมินไม่ได้/),
  ).toBeVisible();
  await page.screenshot({
    path: `output/playwright/community-trust-${page.viewportSize()!.width}.png`,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("owner can read the formula and submit a review in a narrow mobile profile", async ({
  page,
}) => {
  let submitted = false;
  await page.route("**/api/community/me/xp", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({
      json: {
        ...value,
        community_trust: {
          policy_version: "community-trust-v1",
          status: "available",
          score: 78.5714285714,
          window_start: "2026-08-10",
          window_end: "2026-11-07",
          unique_voter_accounts: 8,
          evaluated_report_count: 12,
          evaluated_day_count: 6,
          effective_day_weight: 18,
          last_feedback_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
          contribution_days_30: 8,
          review_available: true,
          daily: [
            {
              day: "2026-11-07",
              positive: 2,
              negative: 1,
              count: 3,
              value: 66.666666,
              weight: 3,
            },
          ],
        },
      },
    });
  });
  await page.route("**/api/community/trust/reviews", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual([
        "from_day",
        "message",
        "to_day",
      ]);
      submitted = true;
      await route.fulfill({
        json: { id: "00000000-0000-4000-8000-000000000001", status: "pending" },
      });
    } else
      await route.fulfill({
        json: {
          requests: submitted
            ? [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  status: "pending",
                  created_at: new Date().toISOString(),
                  reason: null,
                },
              ]
            : [],
        },
      });
  });
  await page.goto("/profile");
  const card = page.getByRole("region", { name: "Trust ชุมชน", exact: true });
  await expect(card.getByText("78.6/100", { exact: true })).toBeVisible();
  await expect(card.getByText(/ช่วยรายงาน 8 วันใน 30/)).toBeVisible();
  await card.getByText("สูตรและข้อมูลรองรับ", { exact: true }).click();
  await expect(card.getByText(/น้ำหนักรวม 18/)).toBeVisible();
  await card.getByText("ติดตามคำขอทบทวน", { exact: true }).click();
  await card.getByText("ขอทบทวนเสียงประเมิน", { exact: true }).click();
  await card.getByLabel("ตั้งแต่วันที่", { exact: true }).fill("2026-11-01");
  await card.getByLabel("ถึงวันที่", { exact: true }).fill("2026-11-07");
  await card
    .getByLabel("เหตุผลขอทบทวน", { exact: true })
    .fill("ขอทบทวนเสียงประเมินในช่วงวันที่เลือก");
  await card.getByRole("button", { name: "ส่งคำขอทบทวน", exact: true }).click();
  await expect(card.getByText("บันทึกคำขอทบทวนแล้ว")).toBeVisible();
  expect(submitted).toBe(true);
  await expect(card.getByText("รอทบทวน", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `output/playwright/community-trust-profile-${page.viewportSize()!.width}.png`,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
