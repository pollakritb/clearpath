import { expect, test } from "@playwright/test";

for (const origin of ["/", "/air", "/report", "/community", "/requests"]) {
  test(`settings Close returns to ${origin} through nested pages and reload`, async ({
    page,
  }) => {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "เปิดโปรไฟล์", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "โปรไฟล์", exact: true })
      .getByRole("link", { name: "การตั้งค่า", exact: true })
      .click();
    const close = page.getByRole("link", {
      name: "ปิดการตั้งค่า",
      exact: true,
    });
    await expect(close).toHaveAttribute("href", origin);
    await close.click();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(origin);
    await page
      .getByRole("button", { name: "เปิดโปรไฟล์", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "โปรไฟล์", exact: true })
      .getByRole("link", { name: "การตั้งค่า", exact: true })
      .click();
    await page.getByRole("link", { name: /การแจ้งเตือน.*ช่องทาง/ }).click();
    await expect(close).toHaveAttribute("href", origin);
    await page
      .getByRole("link", { name: "กลับไปการตั้งค่า", exact: true })
      .click();
    await expect(close).toHaveAttribute("href", origin);
    await page.getByRole("link", { name: /ข้อมูลบัญชี.*ดาวน์โหลด/ }).click();
    await expect(close).toHaveAttribute("href", origin);
    await page.reload();
    await expect(close).toHaveAttribute("href", origin);
    await close.click();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(origin);
  });
}

test("settings opened from map layers returns to the map", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่", exact: true })
    .click();
  await page
    .getByRole("region", { name: "เลือกข้อมูลที่แสดงบนแผนที่", exact: true })
    .getByRole("link", { name: "การตั้งค่า", exact: true })
    .click();
  const close = page.getByRole("link", { name: "ปิดการตั้งค่า", exact: true });
  await expect(close).toHaveAttribute("href", "/");
  await close.click();
  await expect(page).toHaveURL(/\/$/);
});

test("direct settings entry closes to map and does not reuse an earlier entry", async ({
  page,
}) => {
  await page.goto("/settings");
  const close = page.getByRole("link", { name: "ปิดการตั้งค่า", exact: true });
  await expect(close).toHaveAttribute("href", "/");
  await close.click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/air");
  await page.getByRole("button", { name: "เปิดโปรไฟล์", exact: true }).click();
  await page
    .getByRole("dialog", { name: "โปรไฟล์", exact: true })
    .getByRole("link", { name: "การตั้งค่า", exact: true })
    .click();
  await expect(close).toHaveAttribute("href", "/air");
  await page.goBack();
  await expect(page).toHaveURL(/\/air$/);
  await page.goForward();
  await expect(close).toHaveAttribute("href", "/air");
  await close.click();
  await page.goto("/settings");
  await expect(close).toHaveAttribute("href", "/");
});

for (const origin of ["/", "/air"]) {
  test(`participation Close returns to ${origin} after switching tabs`, async ({
    page,
  }) => {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "เปิดโปรไฟล์", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "โปรไฟล์", exact: true })
      .getByRole("link", { name: "ผลงานและอันดับ", exact: true })
      .click();
    const close = page.getByRole("link", {
      name: "ปิดการตั้งค่า",
      exact: true,
    });
    await expect(close).toHaveAttribute("href", origin);
    await page
      .getByRole("button", { name: "รายงานของฉัน", exact: true })
      .click();
    await expect(close).toHaveAttribute("href", origin);
    await page.reload();
    await expect(close).toHaveAttribute("href", origin);
    await close.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(origin);
  });
}
