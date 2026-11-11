import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const now = () => new Date().toISOString();
const station = () => ({
  id: "103t",
  name_th: "สถานีทดสอบมือถือ",
  lat: 13.82,
  lon: 100.0622,
  pm25: 20,
  recorded_at: now(),
  data_status: "fresh",
  age_minutes: 1,
  eligible_for_surface: true,
  in_service_area: true,
});
async function gps(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 13.82, longitude: 100.0622, accuracy: 10 });
}
async function preferences(page: Page) {
  const response = await page.request.get("/api/notifications/preferences");
  return {
    ...(await response.json()),
    center_lat: 13.82,
    center_lon: 100.06,
    pm25_threshold: 37.5,
  };
}
async function readyDraft(page: Page) {
  await gps(page);
  let requests = 0;
  await page.route("**/api/community/report-drafts", (route) => {
    requests++;
    return route.fulfill({
      status: 201,
      json: {
        id: "ux-draft",
        ocr_pm25: 23.4,
        ocr_confidence: 1,
        ocr_available: true,
        ocr_status: "ready",
        captured_at: now(),
        expires_at: new Date(Date.now() + 900_000).toISOString(),
        image_preview_url: null,
      },
    });
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  const capture = page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" });
  await expect(capture).toBeEnabled();
  await capture.click();
  await expect(
    page.getByRole("button", { name: "ส่งรายงาน", exact: true }),
  ).toBeEnabled();
  return () => requests;
}

test("cancel during asynchronous camera switch stops late streams @camera-390", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () =>
        ["back", "front"].map((deviceId) => ({
          deviceId,
          kind: "videoinput",
          groupId: "test",
          label: deviceId,
        })),
    });
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(
    page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stream = await native({ video: true, audio: false });
      Reflect.set(window, "auditLateTracks", stream.getTracks());
      Reflect.set(window, "auditCameraDone", true);
      return stream;
    };
  });
  await page.getByRole("button", { name: "สลับเป็นกล้องหน้า" }).click();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await page.waitForFunction(
    () => Reflect.get(window, "auditCameraDone") === true,
  );
  await expect(page.locator("video")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "เปิดกล้องในแอป" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (Reflect.get(window, "auditLateTracks") as MediaStreamTrack[]).every(
          (track) => track.readyState === "ended",
        ),
      ),
    )
    .toBe(true);
});

test("private report draft survives tab navigation without repeating OCR @camera-390", async ({
  page,
}) => {
  const count = await readyDraft(page);
  const hide = page.getByLabel(/ปิดบังตัวตน/).first();
  if (await hide.count()) await hide.check();
  await page
    .locator(".cp-mobile-nav")
    .getByRole("link", { name: "วันนี้" })
    .click();
  await page
    .locator(".cp-mobile-nav")
    .getByRole("link", { name: "ส่งรายงาน" })
    .click();
  await expect(page.getByText(/กู้คืนร่างรายงานแล้ว/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ส่งรายงาน", exact: true }),
  ).toBeEnabled();
  expect(count()).toBe(1);
});

test("rejected report uses warning presentation and a clear retake action @camera-390", async ({
  page,
}) => {
  await page.route("**/api/community/report-drafts/ux-draft/submit", (route) =>
    route.fulfill({
      json: {
        report: { verified_pm25: null, user_claimed_pm25: 23.4 },
        review_outcome: "automatic_rejected",
        review_reasons: ["อ่านหลักฐานไม่ได้"],
        message: "กรุณาถ่ายใหม่",
      },
    }),
  );
  await readyDraft(page);
  await page.getByRole("button", { name: "ส่งรายงาน", exact: true }).click();
  await expect(
    page.locator('.cp-report-success[data-outcome="rejected"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ถ่ายภาพใหม่และลองอีกครั้ง" }),
  ).toBeVisible();
});

test("request confirmation opens the full usable form", async ({ page }) => {
  await page.route("**/api/locations/reverse?*", (route) =>
    route.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }).click();
  await page.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }).click();
  const sheet = page.getByRole("region", {
    name: "ขอค่าฝุ่นบนแผนที่",
    exact: true,
  });
  await expect(sheet).toHaveAttribute("data-snap", "full");
  await expect(
    sheet.getByRole("button", { name: "ส่งคำขอ", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "ปิดการขอค่าฝุ่น" }).click();
  await expect(sheet).toHaveCount(0);
});

test("tool sheet owns focus, retains close while scrolling, and restores its trigger", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "เลือกข้อมูลที่แสดงบนแผนที่",
    exact: true,
  });
  await trigger.click();
  const sheet = page.locator("#cp-map-layers-panel");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await sheet.locator("[data-sheet-grip]").evaluate((element) => {
    element.parentElement!.parentElement!.scrollTop = 9999;
  });
  await expect(
    sheet.getByRole("button", { name: "ปิดตัวเลือกข้อมูล" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("direct detail entries have an in-app Back fallback", async ({ page }) => {
  await page.goto("/members/MBR-000001");
  const back = page.getByRole("link", { name: "← กลับ", exact: true });
  await expect(back).toHaveAttribute("href", "/profile?tab=leaderboard");
  await back.click();
  await expect(page).toHaveURL(/\/profile\?tab=leaderboard$/);
  await page.goto("/requests");
  await page.getByRole("link", { name: "← กลับ", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("legal Back reflows at actual 200 percent root text", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).fontSize,
      ),
    ).toBe("32px");
    const bounds = await page.locator(".cp-legal-back").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  }
});

test("all populated AQI bands have accessible text contrast", async ({
  page,
}) => {
  await gps(page);
  for (const pm25 of [10, 20, 34, 60, 90]) {
    await page.route("**/api/pm25/current", (route) =>
      route.fulfill({
        json: {
          stations: [{ ...station(), pm25 }],
          count: 1,
          updated_at: now(),
          fresh_count: 1,
        },
      }),
    );
    await page.goto("/air");
    await page.locator(".cp-current-reading").waitFor();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const axe = await new AxeBuilder({ page })
      .include(".cp-current-reading")
      .withRules(["color-contrast"])
      .analyze();
    expect(axe.violations).toEqual([]);
  }
});

test("expired AQI does not give unqualified current-health reassurance", async ({
  page,
}) => {
  await gps(page);
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        stations: [
          {
            ...station(),
            recorded_at: new Date(Date.now() - 86400000).toISOString(),
            data_status: "expired",
            age_minutes: 1440,
            eligible_for_surface: false,
          },
        ],
        count: 1,
        expired_count: 1,
        updated_at: now(),
      },
    }),
  );
  await page.goto("/air");
  const card = page.locator(".cp-current-reading");
  await expect(card).toContainText("ไม่ใช่ข้อมูลอากาศปัจจุบัน");
  await expect(card).not.toContainText("ทำกิจกรรมได้ตามปกติ");
});

test("failed preference load cannot overwrite saved settings with defaults", async ({
  page,
}) => {
  const value = await preferences(page);
  let fail = true;
  await page.route("**/api/notifications/preferences", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } })
      : route.fulfill({ json: value }),
  );
  await page.goto("/settings/notifications");
  await expect(
    page.getByRole("button", { name: "บันทึกเงื่อนไข", exact: true }),
  ).toHaveCount(0);
  const retry = page.getByRole("button", { name: "ลองโหลดเงื่อนไขใหม่" });
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(
    page.getByRole("button", { name: "แก้ไขเงื่อนไข", exact: true }),
  ).toBeVisible();
});

test("closing unsaved preference editing restores the persisted summary", async ({
  page,
}) => {
  const value = await preferences(page);
  await page.route("**/api/notifications/preferences", (route) =>
    route.fulfill({ json: value }),
  );
  await page.goto("/settings/notifications");
  await page
    .getByRole("button", { name: "แก้ไขเงื่อนไข", exact: true })
    .click();
  await page.locator('input[type="range"]').first().fill("60");
  await page.getByRole("button", { name: "ปิดการแก้ไข", exact: true }).click();
  await expect(
    page.locator(".cp-notification-condition-summary").first(),
  ).toContainText("37.5");
  await expect(page.getByText(/ยังใช้เงื่อนไขที่บันทึกไว้เดิม/)).toBeVisible();
});

test("LINE status load failures stop loading and offer a working retry", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/notifications/line", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { detail: "failed" } })
      : route.fulfill({ json: { enabled: false, linked: false } }),
  );
  await page.goto("/settings/notifications");
  const retry = page.getByRole("button", { name: "ลองโหลดสถานะ LINE ใหม่" });
  await expect(retry).toBeVisible();
  await expect(page.locator(".cp-line-link")).not.toContainText(
    "กำลังตรวจสถานะ LINE",
  );
  fail = false;
  await retry.click();
  await expect(page.locator(".cp-line-link")).toContainText(
    "ระบบ LINE ยังรอการเปิดใช้งาน",
  );
});

test("helper editor restores focus and deletion requires explicit confirmation", async ({
  page,
}) => {
  let deleted = false;
  const place = {
    slot: 1,
    name: "บ้านทดสอบ",
    address: "นครปฐม",
    lat: 13.82,
    lon: 100.06,
    enabled: true,
  };
  await page.route("**/api/measurement-requests/helper", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        registered_locations_enabled: true,
        locations: deleted ? [] : [place],
      },
    }),
  );
  await page.route(
    "**/api/measurement-requests/helper/locations/1",
    (route) => {
      deleted = true;
      return route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("/settings/notifications");
  const edit = page.getByRole("button", {
    name: "แก้ไขสถานที่ บ้านทดสอบ",
    exact: true,
  });
  await edit.click();
  await page
    .getByRole("button", { name: "ปิดการเลือกพื้นที่", exact: true })
    .click();
  await expect(edit).toBeFocused();
  await page
    .getByRole("button", { name: "ลบสถานที่ บ้านทดสอบ", exact: true })
    .click();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "เก็บไว้", exact: true }).click();
  expect(deleted).toBe(false);
  await page
    .getByRole("button", { name: "ลบสถานที่ บ้านทดสอบ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ยืนยันลบสถานที่ บ้านทดสอบ", exact: true })
    .click();
  await expect.poll(() => deleted).toBe(true);
});

test("XP event labels and v3 policy distinguish participation from community Trust", async ({
  page,
}) => {
  await page.route("**/api/community/me/xp", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), policy_version: "contribution-v3" },
    });
  });
  await page.route("**/api/community/me/xp-events?*", (route) =>
    route.fulfill({
      json: {
        events: ["first_day", "contribution_week"].map((kind, id) => ({
          id: String(id),
          kind,
          points: id ? 20 : 5,
          reason: "granted",
          occurred_at: now(),
        })),
        next_offset: null,
      },
    }),
  );
  await page.goto("/profile");
  await page.getByText("ประวัติคะแนนส่วนตัว", { exact: true }).click();
  await expect(page.locator(".cp-xp-event strong")).toHaveText([
    "โบนัสรายงานแรกของวัน",
    "โบนัสมีส่วนร่วมครบ 5 วัน",
  ]);
  await page.getByText("กติกาคะแนน", { exact: true }).click();
  await expect(
    page.getByText(/เสียงประเมินที่ผ่านเงื่อนไขมีผลต่อ Trust ชุมชนแยกต่างหาก/),
  ).toBeVisible();
});

test("station list offers a direct mobile map return", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ดูรายการสถานี", exact: true })
    .click();
  const list = page.locator(".cp-list-view");
  await expect(list).toBeVisible();
  await list.getByRole("button", { name: "กลับไปแผนที่", exact: true }).click();
  await expect(list).toHaveCount(0);
});

test("cluster keyboard focus remains visible after the Leaflet CSS cascade", async ({
  page,
}) => {
  await page.goto("/");
  const cluster = page.locator(".cp-marker--cluster").first();
  await page.keyboard.press("Tab");
  await cluster.focus();
  const focus = await cluster.evaluate((element) => ({
    visible: element.matches(":focus-visible"),
    style: getComputedStyle(element).outlineStyle,
    width: parseFloat(getComputedStyle(element).outlineWidth),
  }));
  expect(focus.visible).toBe(true);
  expect(focus.style).not.toBe("none");
  expect(focus.width).toBeGreaterThanOrEqual(2);
  await expect(cluster).toContainText("สถานี");
});

test("secondary mobile targets retain 44px sizing across shared stylesheets", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "ค้นหาสถานที่หรือสถานี", exact: true })
    .click();
  const back = await page
    .getByRole("button", { name: "ปิดการค้นหา", exact: true })
    .boundingBox();
  expect(back!.width).toBeGreaterThanOrEqual(44);
  expect(back!.height).toBeGreaterThanOrEqual(44);
  const grip = await page
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง", exact: true })
    .boundingBox();
  expect(grip!.height).toBeGreaterThanOrEqual(44);
  await page.goto("/admin");
  const signout = page.getByRole("button", { name: "ออกจากระบบ", exact: true });
  await expect(signout).toBeVisible();
  expect((await signout.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("a cancelled camera fallback cannot stop a newly opened camera @camera-390", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () =>
        ["back", "front"].map((deviceId) => ({
          deviceId,
          kind: "videoinput",
          groupId: "test",
          label: deviceId,
        })),
    });
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  const capture = page.getByRole("button", { name: "ถ่ายหน้าจอเครื่องวัด" });
  await expect(capture).toBeEnabled();
  await page.evaluate(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      calls++;
      if (calls === 1)
        throw new DOMException("Switch failed", "NotReadableError");
      if (calls === 2)
        return new Promise<MediaStream>((_, reject) => {
          Reflect.set(window, "rejectOldCameraFallback", () => {
            reject(new DOMException("Old fallback failed", "NotReadableError"));
            Reflect.set(window, "oldFallbackRejected", true);
          });
          Reflect.set(window, "oldCameraFallbackPending", true);
        });
      const stream = await native({ video: true, audio: false });
      Reflect.set(window, "newCameraTracks", stream.getTracks());
      return stream;
    };
  });
  await page.getByRole("button", { name: "สลับเป็นกล้องหน้า" }).click();
  await page.waitForFunction(
    () => Reflect.get(window, "oldCameraFallbackPending") === true,
  );
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await page.getByRole("button", { name: "เปิดกล้องในแอป" }).click();
  await expect(capture).toBeEnabled();
  await page.evaluate(() => Reflect.get(window, "rejectOldCameraFallback")());
  await page.waitForTimeout(100);
  await expect(page.locator("video")).toBeVisible();
  await expect(capture).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (Reflect.get(window, "newCameraTracks") as MediaStreamTrack[]).every(
        (track) => track.readyState === "live",
      ),
    ),
  ).toBe(true);
});

test("publication gap keeps a labelled previous reading outside the current estimate", async ({
  page,
}) => {
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      json: {
        coverage: "nationwide",
        locations: [
          {
            id: "gap-place",
            name: "สถานที่ข้อมูลก่อนหน้า",
            address: "นครปฐม",
            kind: "amenity",
            source: "geoapify",
            lat: 13.82,
            lon: 100.0622,
          },
        ],
      },
    }),
  );
  await page.route("**/api/community/reports**", (route) =>
    route.fulfill({ json: { reports: [], count: 0 } }),
  );
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        stations: [
          {
            ...station(),
            name_th: "สถานีข้อมูลก่อนหน้า",
            recorded_at: new Date(Date.now() - 67 * 60000).toISOString(),
            data_status: "delayed",
            age_minutes: 67,
          },
        ],
        count: 1,
        fresh_count: 0,
        delayed_count: 1,
        expired_count: 0,
        updated_at: now(),
        source: "air4thai",
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ข้อมูลก่อนหน้า");
  await page.getByRole("button", { name: /สถานที่ข้อมูลก่อนหน้า/ }).click();
  const card = page.locator(".cp-place-sheet");
  await expect(card.getByText("ยังไม่มีค่าปัจจุบัน")).toBeVisible();
  await expect(page.locator(".cp-station-marker").first()).toHaveAttribute(
    "style",
    /--marker-aqi:#7b8583/,
  );
  await expect(
    card.getByText("ข้อมูลก่อนหน้า ไม่ใช้คำนวณค่าปัจจุบัน"),
  ).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      card.evaluate((element) => {
        const header =
          element.querySelector("[data-sheet-grip]")?.parentElement;
        return Boolean(
          header &&
          header.getBoundingClientRect().bottom <=
            element.getBoundingClientRect().bottom + 1,
        );
      }),
    )
    .toBe(true);
  await expect(
    card.getByText(/ข้อมูลล่าสุดจาก สถานีข้อมูลก่อนหน้า: 20.0/),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "ปิดสถานที่ที่เลือก" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/source-gap-${page.viewportSize()?.width}.png`,
  });
  await card.getByRole("button", { name: "ปิดสถานที่ที่เลือก" }).click();
  await expect(card).toHaveCount(0);
});
