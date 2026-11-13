import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("map search, profile and layers stay separate and return focus on mobile", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const entries = [
      ["มหาวิทยาลัยเกษตรศาสตร์ กำแพงแสน", "อำเภอกำแพงแสน จังหวัดนครปฐม"],
      ["สวนลุมพินี", "ถนนพระรามที่ 4 ปทุมวัน กรุงเทพมหานคร"],
      ["Central Embassy", "ถนนเพลินจิต กรุงเทพมหานคร"],
    ].map(([name, address], index) => ({
      key: `place:preview-${index}`,
      kind: "place",
      selectedAt: Date.now() - index * 1000,
      location: {
        id: `preview-${index}`,
        name,
        address,
        kind: "amenity",
        source: "local",
        lat: 13.82,
        lon: 100.06,
      },
    }));
    for (const owner of ["guest", "00000000-0000-0000-0000-000000000001"])
      localStorage.setItem(
        `clearpath:search-history:v1:${JSON.stringify(owner)}`,
        JSON.stringify(entries),
      );
  });
  await page.goto("/");
  const search = page.getByRole("button", {
    name: "ค้นหาสถานที่หรือสถานี",
    exact: true,
  });
  const profile = page.getByRole("button", {
    name: "เปิดโปรไฟล์",
    exact: true,
  });
  const layers = page.getByRole("button", {
    name: "เลือกข้อมูลที่แสดงบนแผนที่",
    exact: true,
  });
  const request = page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true });
  const bar = page.locator(".cp-map-topbar");
  await expect(search).toBeVisible();
  for (const control of [search, profile, layers, request]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  const header = (await bar.boundingBox())!;
  const avatar = (await profile.boundingBox())!;
  const layerBox = (await layers.boundingBox())!;
  const requestBox = (await request.boundingBox())!;
  expect(avatar.x + avatar.width).toBeLessThanOrEqual(header.x + header.width);
  expect(layerBox.y).toBeGreaterThanOrEqual(header.y + header.height + 8);
  expect(requestBox.x + requestBox.width).toBeLessThan(layerBox.x);
  expect(header.width).toBeGreaterThan(page.viewportSize()!.width - 32);
  await page.screenshot({
    path: `output/playwright/map-search-home-${page.viewportSize()!.width}.png`,
  });

  await profile.click();
  const account = page.getByRole("dialog", { name: "โปรไฟล์", exact: true });
  await expect(account.getByRole("link", { name: "การตั้งค่า" })).toBeVisible();
  await expect(
    account.getByRole("link", { name: "ผลงานและอันดับ" }),
  ).toBeVisible();
  await account.getByRole("button", { name: "ปิดโปรไฟล์" }).click();
  await expect(profile).toBeFocused();
  await layers.click();
  await page.getByRole("button", { name: "ปิดตัวเลือกข้อมูล" }).click();
  await expect(layers).toBeFocused();

  await search.click();
  const screen = page.getByRole("region", {
    name: "ค้นหาสถานที่หรือสถานี",
    exact: true,
  });
  await expect(screen.getByRole("searchbox")).toBeFocused();
  await expect(
    screen.getByRole("region", { name: "ประวัติการค้นหา" }),
  ).toBeVisible();
  const full = (await screen.boundingBox())!;
  expect(full.y).toBeLessThanOrEqual(1);
  expect(full.width).toBe(page.viewportSize()!.width);
  const nav = (await page.locator(".cp-mobile-nav").boundingBox())!;
  expect(Math.abs(full.y + full.height - nav.y)).toBeLessThanOrEqual(1);
  await expect(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  ).toHaveCount(0);
  const a11y = await new AxeBuilder({ page })
    .include("#cp-map-search-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({
    path: `output/playwright/map-search-open-${page.viewportSize()!.width}.png`,
  });
  await screen
    .getByRole("button", { name: "ลบ สวนลุมพินี จากประวัติ" })
    .click();
  await expect(screen.getByText("สวนลุมพินี", { exact: true })).toHaveCount(0);
  await screen.getByRole("button", { name: "ล้างประวัติทั้งหมด" }).click();
  await expect(
    screen.getByRole("region", { name: "ประวัติการค้นหา" }),
  ).toHaveCount(0);
  await screen.getByRole("button", { name: "ปิดการค้นหา" }).click();
  await expect(search).toBeFocused();
  await search.click();
  await screen.getByRole("searchbox").press("Escape");
  await expect(screen).toHaveCount(0);
  await expect(search).toBeFocused();
  await profile.click();
  await account.getByRole("link", { name: "การตั้งค่า", exact: true }).click();
  await expect(page).toHaveURL(/\/settings(?:\?returnTo=[^#]*)?$/);
});
