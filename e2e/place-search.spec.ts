import { expect, test } from "@playwright/test";

test("place focus shows a compact two-kilometre evidence area and restores the map", async ({
  page,
}) => {
  await page.route("**/api/locations/search?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        coverage: "nationwide",
        locations: [
          {
            id: "geoapify:test-place",
            name: "สถานที่ทดสอบ",
            address: "อำเภอเมืองนครปฐม ประเทศไทย",
            kind: "amenity",
            source: "geoapify",
            lat: 13.8199,
            lon: 100.0622,
          },
        ],
      }),
    });
  });

  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        stations: [
          {
            id: "fixture-station",
            name_th: "สถานีทดสอบ",
            lat: 13.82,
            lon: 100.0622,
            pm25: 18,
            recorded_at: new Date().toISOString(),
            data_status: "fresh",
            eligible_for_surface: true,
            in_service_area: true,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await expect(
    page.getByRole("button", { name: /สถานที่ทดสอบ/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();

  const card = page.locator(".cp-place-sheet");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-snap", "peek");
  await expect(card.getByText("สถานที่ทดสอบ")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "ขอค่าฝุ่นบนแผนที่", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }),
  ).toHaveCount(0);
  await expect(card.getByLabel("ข้อมูลในรัศมี 2 กม.")).toBeVisible();
  await expect(page.locator(".cp-place-marker")).toHaveCount(1);
  await expect(
    card.getByRole("heading", { name: /สถานีที่ใช้คำนวณ/ }),
  ).toHaveCount(0);
  const marker = await page.locator(".cp-place-marker").boundingBox();
  const collapsedCard = await card.boundingBox();
  expect(marker).not.toBeNull();
  expect(collapsedCard).not.toBeNull();
  expect(marker!.y + marker!.height).toBeLessThan(collapsedCard!.y);
  await expect(page.locator('.cp-mapctrls__error[role="status"]')).toBeHidden();
  // The summary should leave the map visible while controls remain touchable.
  // Current sheet deliberately previews up to 64px of detail below its header.
  const headerHeight = await card
    .locator("[data-sheet-grip]")
    .evaluate(
      (element) => element.parentElement!.getBoundingClientRect().height,
    );
  expect(collapsedCard!.height).toBeLessThanOrEqual(headerHeight + 64 + 1);
  // Read both rectangles together so an in-flight height transition cannot skew the comparison.
  await expect
    .poll(() =>
      card.evaluate((element) => {
        const title = element.querySelector("h1")!.getBoundingClientRect();
        const handle = element
          .querySelector("[data-sheet-grip]")!
          .getBoundingClientRect();
        return title.top - handle.bottom;
      }),
    )
    .toBeGreaterThanOrEqual(0);
  for (const label of [
    "ดูย้อนหลังของสถานที่นี้",
    "ดูพยากรณ์ของสถานที่นี้",
    "ปิดสถานที่ที่เลือก",
  ]) {
    const target = await card
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({ path: "test-results/place-focus-mobile.png" });

  await card
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("End");
  await expect(card).toHaveAttribute("data-expanded", "true");
  await expect(
    card.getByRole("heading", { name: /สถานีที่ใช้คำนวณ/ }),
  ).toBeVisible();
  const expandedContent = await card.evaluate((element) => {
    const body = element.querySelector<HTMLElement>("[aria-hidden='false']");
    return {
      height: element.getBoundingClientRect().height,
      summaryHeight:
        body?.previousElementSibling?.getBoundingClientRect().height ?? 0,
      bodyHeight: body?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(expandedContent.height).toBeLessThanOrEqual(
    expandedContent.summaryHeight + expandedContent.bodyHeight + 2,
  );

  await expect(
    card.getByRole("heading", { name: /รายงานที่ใช้คำนวณ/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/place-focus-details-mobile.png",
  });

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  await page.setViewportSize({ width: 430, height: 932 });
  await expect(card).toHaveAttribute("data-expanded", "true");
  const expandedBounds = await card.boundingBox();
  expect(expandedBounds).not.toBeNull();
  expect(expandedBounds!.height).toBeGreaterThan(collapsedCard!.height);
  await page.screenshot({ path: "test-results/place-focus-details-430.png" });
  await card
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("Home");
  const compactBounds = await card.boundingBox();
  const navBounds = await page.locator(".cp-mobile-nav").boundingBox();
  expect(compactBounds).not.toBeNull();
  expect(navBounds).not.toBeNull();
  expect(compactBounds!.width).toBeGreaterThan(300);
  expect(compactBounds!.width).toBeLessThanOrEqual(430);
  expect(compactBounds!.y + compactBounds!.height).toBeLessThan(navBounds!.y);
  await page.screenshot({ path: "test-results/place-focus-compact-430.png" });
  await card
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("End");
  await card.getByRole("button", { name: "ปิดสถานที่ที่เลือก" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".cp-place-marker")).toHaveCount(0);

  // Request editing owns its location header; close it before a general search.
  await page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "สถานที่หรือที่อยู่" })
    .fill("สถานที่ทด");
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();
  await expect(
    page.getByRole("button", { name: "ค้นหาหรือแก้ไขสถานที่ขอค่าฝุ่น" }),
  ).toContainText("สถานที่ทดสอบ");
  await page.getByRole("button", { name: "ใช้จุดนี้เพื่อขอค่าฝุ่น" }).click();
  await expect(
    page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "ค้นหาหรือแก้ไขสถานที่ขอค่าฝุ่น",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ปิดการขอค่าฝุ่น", exact: true })
    .click();
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();
  await expect(page.locator(".cp-map-request-panel")).toHaveCount(0);
  await expect(
    page.locator(".cp-place-sheet").getByText("สถานที่ทดสอบ", { exact: true }),
  ).toBeVisible();
});

test("OpenStreetMap place keeps its PM2.5 reading and credits the place source", async ({
  page,
}) => {
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        updated_at: new Date().toISOString(),
        count: 1,
        fresh_count: 1,
        delayed_count: 0,
        expired_count: 0,
        stations: [
          {
            id: "81t",
            name_th: "สถานีทดสอบ",
            lat: 13.8199,
            lon: 100.0622,
            pm25: 18.5,
            recorded_at: new Date().toISOString(),
            data_status: "fresh",
            age_minutes: 1,
            eligible_for_surface: true,
            in_service_area: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        coverage: "nationwide",
        locations: [
          {
            id: "openstreetmap:test-place",
            name: "สถานที่ทดสอบ OSM",
            address: "อำเภอเมืองนครปฐม ประเทศไทย",
            kind: "amenity",
            source: "openstreetmap",
            lat: 13.8199,
            lon: 100.0622,
          },
        ],
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await page.getByRole("button", { name: /สถานที่ทดสอบ OSM/ }).click();
  const card = page.locator(".cp-place-sheet");
  await card
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("End");
  await expect(card.getByText("18.5", { exact: true }).first()).toBeVisible();
  await card
    .locator("summary")
    .filter({ hasText: "ที่มาและวิธีประเมิน" })
    .click();
  await expect(
    card.getByRole("link", { name: "© OpenStreetMap contributors" }),
  ).toBeVisible();
});

test("search keeps recent selections after reload and supports deleting or clearing history", async ({
  page,
}) => {
  const locations = [
    {
      id: "local:park",
      name: "สวนทดสอบ",
      address: "นครปฐม",
      kind: "park",
      source: "local",
      lat: 13.8199,
      lon: 100.0622,
    },
    {
      id: "local:school",
      name: "โรงเรียนทดสอบ",
      address: "นครปฐม",
      kind: "school",
      source: "local",
      lat: 13.82,
      lon: 100.06,
    },
  ];
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({ json: { locations, coverage: "limited" } }),
  );
  await page.goto("/");
  for (const location of locations) {
    await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
    await page.getByRole("searchbox").fill("ทดสอบ");
    await page
      .locator(".cp-map-search-results")
      .getByRole("button", { name: new RegExp(location.name) })
      .click();
    const sheet = page.locator(".cp-place-sheet");
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    // Exercise the actual pointer gesture, rather than an expand button.
    const grip = await sheet
      .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
      .boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + 22);
    await page.mouse.down();
    await page.mouse.move(grip!.x + grip!.width / 2, 12, { steps: 12 });
    await page.mouse.up();
    await expect(sheet).toHaveAttribute("data-snap", "full");
    await sheet.getByRole("button", { name: "ปิดสถานที่ที่เลือก" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  const recent = page.getByRole("region", { name: "ประวัติการค้นหา" });
  await expect(recent.getByText("สวนทดสอบ", { exact: true })).toBeVisible();
  await expect(
    recent.getByText("โรงเรียนทดสอบ", { exact: true }),
  ).toBeVisible();
  await recent.getByRole("button", { name: "ลบ สวนทดสอบ จากประวัติ" }).click();
  await expect(recent.getByText("สวนทดสอบ", { exact: true })).toHaveCount(0);
  await recent.getByRole("button", { name: "ล้างประวัติทั้งหมด" }).click();
  await expect(recent).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await expect(
    page.getByRole("region", { name: "ประวัติการค้นหา" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("place time actions open separate forecast and history while keeping the radius and sources", async ({
  page,
}) => {
  const place = {
    id: "local:time-test",
    name: "สถานที่ดูเวลา",
    address: "นครปฐม",
    kind: "place",
    source: "local",
    lat: 13.8199,
    lon: 100.0622,
  };
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({ json: { locations: [place], coverage: "limited" } }),
  );
  await page.route("**/api/history/map?*", (route) =>
    route.fulfill({
      json: {
        target_at: new URL(route.request().url()).searchParams.get("at"),
        stations: [],
        reports: [],
        stacks: [],
      },
    }),
  );
  await page.route("**/api/forecast?*", (route) =>
    route.fulfill({
      json: {
        station_id: null,
        target_kind: "area",
        requested_lat: place.lat,
        requested_lon: place.lon,
        points: [],
        forecast_status: "unavailable",
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page.getByRole("searchbox").fill("สถานที่ดูเวลา");
  await page
    .locator(".cp-map-search-results")
    .getByRole("button", { name: /สถานที่ดูเวลา/ })
    .click();
  const placeSheet = page.locator(".cp-place-sheet");
  await expect(placeSheet).toHaveAttribute("data-snap", "peek");
  await expect(
    placeSheet.getByRole("region", { name: "พยากรณ์ PM2.5 รายชั่วโมง" }),
  ).toHaveCount(0);
  await expect(page.locator(".cp-search-radius-label")).toContainText(
    "รัศมี 2 กม. · ค้นหาข้อมูล",
  );
  const radiusLabel = await page
    .locator(".cp-search-radius-label")
    .boundingBox();
  expect(radiusLabel!.x).toBeGreaterThanOrEqual(0);
  expect(radiusLabel!.x + radiusLabel!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await placeSheet
    .getByRole("button", { name: "ดูพยากรณ์ของสถานที่นี้" })
    .click();
  const forecast = page.getByRole("region", {
    name: "พยากรณ์ค่าฝุ่นของสถานที่",
  });
  await expect(forecast).toHaveAttribute("data-snap", "full");
  await expect(
    forecast.getByText("ยังไม่มีพยากรณ์สำหรับบริเวณนี้"),
  ).toBeVisible();
  await forecast.getByRole("button", { name: "กลับไปที่สถานที่" }).click();
  await placeSheet
    .getByRole("button", { name: "ดูย้อนหลังของสถานที่นี้" })
    .click();
  const history = page.getByRole("region", {
    name: "ค่าฝุ่นย้อนหลังของสถานที่",
  });
  const slider = history.getByRole("slider", {
    name: "เลือกชั่วโมงย้อนหลังของสถานที่",
  });
  await slider.fill("23");
  await expect(slider).toHaveAttribute("aria-valuetext", "ย้อนหลัง 1 ชั่วโมง");
  await expect(
    history.getByText(/ไม่มีข้อมูลที่ใช้ประเมินได้ในวง 2 กม./),
  ).toBeVisible();
  await history.getByRole("button", { name: "กลับไปที่สถานที่" }).click();
  await expect(placeSheet).toHaveAttribute("data-snap", "peek");
});

test("place estimate counts a repeat reporter once and discloses excluded readings", async ({
  page,
}) => {
  const now = Date.now();
  const place = {
    id: "local:single-test",
    name: "จุดทดสอบรายงานเดียว",
    address: "กรุงเทพมหานคร",
    source: "local",
    kind: "place",
    lat: 13.8,
    lon: 100.1,
  };
  await page.route("**/api/locations/search?*", (route) =>
    route.fulfill({ json: { coverage: "nationwide", locations: [place] } }),
  );
  await page.route("**/api/pm25/current", (route) =>
    route.fulfill({
      json: {
        stations: [
          {
            id: "old-station",
            name_th: "สถานีข้อมูลเก่า",
            lat: 13.811,
            lon: 100.1,
            pm25: 20.5,
            recorded_at: new Date(now - 90 * 60000).toISOString(),
            data_status: "delayed",
            eligible_for_surface: false,
            in_service_area: true,
          },
        ],
      },
    }),
  );
  const reports = [
    {
      id: "RPT-111111",
      user_id: "anonymous-per-report-a",
      pm25: 34,
      captured_at: new Date(now - 120 * 60000).toISOString(),
    },
    {
      id: "RPT-111112",
      user_id: "anonymous-per-report-b",
      pm25: 80,
      captured_at: new Date(now - 140 * 60000).toISOString(),
    },
  ].map((report) => ({
    ...report,
    created_at: report.captured_at,
    display_name: "ผู้รายงานไม่เปิดเผยตัวตน",
    show_reporter_profile: false,
    lat: 13.804,
    lon: 100.1,
    status: "approved",
    source_type: "individual",
    is_fresh: true,
    location_precision_m: 150,
  }));
  await page.route("**/api/community/reports", (route) =>
    route.fulfill({ json: { reports, stacks: [], count: 2 } }),
  );
  await page.route("**/api/community/place-report-selection?*", (route) =>
    route.fulfill({
      json: {
        report_ids: ["RPT-111111"],
        target_at: new Date(now).toISOString(),
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page.getByRole("searchbox").fill(place.name);
  await page
    .locator(".cp-map-search-results")
    .getByRole("button", { name: new RegExp(place.name) })
    .click();
  const sheet = page.locator(".cp-place-sheet");
  await expect(sheet.getByText("34", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText("อ้างอิง ผู้รายงาน 1 คน", { exact: true }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
    .press("End");
  await expect(sheet.getByText(/ใช้ข้อมูลจุดเดียว ไม่ได้เฉลี่ย/)).toBeVisible();
  await expect(
    sheet.getByRole("heading", { name: /รายงานที่ใช้คำนวณ.*1 คน/ }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: /สถานีข้อมูลเก่า/ }),
  ).toBeHidden();
  await sheet
    .getByText("ข้อมูลอื่นที่ไม่ใช้คำนวณ (2)", { exact: true })
    .click();
  await expect(
    sheet.getByRole("button", { name: /สถานีข้อมูลเก่า/ }),
  ).toBeVisible();
  await expect(sheet.getByText(/มีรายงานใหม่กว่าจากคนนี้/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
