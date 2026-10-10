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
  await expect(card.getByText(/วง 5 กม./)).toBeVisible();
  await expect(page.locator(".cp-place-marker")).toHaveCount(1);
  await page.screenshot({ path: "test-results/place-focus-mobile.png" });

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  await card.getByRole("button", { name: "กลับสู่แผนที่รวม" }).last().click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".cp-place-marker")).toHaveCount(0);
});
