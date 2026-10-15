import { expect, test } from "@playwright/test";

test("place focus shows a five-kilometre evidence area and restores the map", async ({
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

  await page.goto("/");
  await page.getByRole("button", { name: "ค้นหาสถานที่หรือสถานี" }).click();
  await page
    .getByPlaceholder("ชื่อสถานที่ ที่อยู่ หรือสถานี")
    .fill("สถานที่ทด");
  await expect(
    page.getByRole("button", { name: /สถานที่ทดสอบ/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /สถานที่ทดสอบ/ }).click();

  const card = page.getByRole("region", { name: "ค่าฝุ่นรอบสถานที่ที่เลือก" });
  await expect(card).toBeVisible();
  await expect(card.getByText("สถานที่ทดสอบ")).toBeVisible();
  await expect(card.locator(".cp-place-card__radius")).toContainText(
    "วง 5 กม.",
  );
  await expect(page.locator(".cp-place-marker")).toHaveCount(1);
  await expect(
    card.getByRole("heading", { name: "สถานีตรวจวัด" }),
  ).toBeHidden();
  const marker = await page.locator(".cp-place-marker").boundingBox();
  const collapsedCard = await card.boundingBox();
  expect(marker).not.toBeNull();
  expect(collapsedCard).not.toBeNull();
  expect(marker!.y + marker!.height).toBeLessThan(collapsedCard!.y);
  await page.screenshot({ path: "test-results/place-focus-mobile.png" });

  await card.getByText("ดูข้อมูลภายในวง 5 กม.").click();
  await expect(
    card.getByRole("link", { name: /ดูพยากรณ์ PM2.5 สำหรับบริเวณนี้/ }),
  ).toHaveAttribute("href", /\/air\?lat=13\.82&lon=100\.06/);
  await expect(
    card.getByRole("heading", { name: "สถานีตรวจวัด" }),
  ).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "รายงานจากบุคคล" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/place-focus-details-mobile.png",
  });

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  await card.getByRole("button", { name: "กลับสู่แผนที่รวม" }).last().click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".cp-place-marker")).toHaveCount(0);
});

test("OpenStreetMap place keeps its PM2.5 reading and credits the place source", async ({
  page,
}) => {
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
  const card = page.getByRole("region", { name: "ค่าฝุ่นรอบสถานที่ที่เลือก" });
  await expect(card.locator(".cp-place-card__reading strong")).toContainText(
    /\d+\.\d/,
  );
  await expect(
    card.getByRole("link", { name: "© OpenStreetMap contributors" }),
  ).toBeVisible();
});
