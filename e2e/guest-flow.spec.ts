import { expect, test } from "@playwright/test";

test.skip(
  process.env.RUN_GUEST_FLOW !== "true",
  "Requires a non-demo guest build",
);

for (const path of [
  "/report",
  "/requests",
  "/profile",
  "/settings/notifications",
  "/admin",
]) {
  test(`guest at ${path} can dismiss login and return from account settings`, async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      if (
        ["POST", "PATCH", "PUT", "DELETE"].includes(route.request().method())
      ) {
        writes++;
        return route.fulfill({
          status: 401,
          json: { detail: "Unauthorized test" },
        });
      }
      return route.continue();
    });
    await page.goto(path);
    const login = page
      .getByRole("button", { name: /เข้าสู่ระบบ.*(Google|คำขอ|ผลงาน)/ })
      .first();
    await expect(login).toBeVisible();
    await login.click();
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("button", { name: "ปิดหน้าต่างเข้าสู่ระบบ" }),
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "ปิดหน้าต่างเข้าสู่ระบบ" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(login).toBeFocused();
    await login.click();
    await dialog.press("Escape");
    await expect(dialog).toBeHidden();
    await login.click();
    await dialog
      .getByRole("link", { name: "จัดการบัญชีและความเป็นส่วนตัว" })
      .click();
    const close = page.getByRole("link", {
      name: "ปิดการตั้งค่า",
      exact: true,
    });
    const expected = path.startsWith("/settings") ? "/" : path;
    await expect(close).toHaveAttribute("href", expected);
    await close.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(expected);
    expect(writes).toBe(0);
  });
}

test("guest profile menu exposes login and settings but never admin actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "เปิดโปรไฟล์", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "โปรไฟล์", exact: true });
  await expect(
    menu.getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole("link", { name: "ภาพรวมผู้ดูแล" })).toHaveCount(
    0,
  );
  await expect(menu.getByRole("button", { name: "ออกจากระบบ" })).toHaveCount(0);
  await menu.getByRole("button", { name: "ปิดโปรไฟล์" }).click();
  await expect(
    page.getByRole("button", { name: "เปิดโปรไฟล์", exact: true }),
  ).toBeFocused();
});

test("guest reporting for a request has a login explanation instead of endless loading", async ({
  page,
}) => {
  await page.goto("/report?request=REQ-GUEST");
  await expect(
    page.getByText("เข้าสู่ระบบเพื่อดูรายละเอียดคำขอ", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("กำลังโหลดคำขอ…", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true }),
  ).toBeVisible();
});
