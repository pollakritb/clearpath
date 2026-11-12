import { test, expect } from "@playwright/test";
// Opt-in: run against an isolated local-demo backend with registered areas on.
test.skip(
  process.env.RUN_HELPER_BACKEND_INTEGRATION !== "true",
  "Requires local-demo registered-area backend",
);
test("new helper area creates with POST, edits with PATCH and deletes through real backend @stateful-360", async ({
  page,
}) => {
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 13.82, longitude: 100.06, accuracy: 10 });
  await page.route("**/api/locations/reverse?*", (route) =>
    route.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
  );
  const helper = await page.request.get("/api/measurement-requests/helper");
  expect(helper.ok()).toBe(true);
  expect((await helper.json()).registered_locations_enabled).toBe(true);
  for (const slot of [1, 2])
    await page.request.delete(
      `/api/measurement-requests/helper/locations/${slot}`,
    );
  await page.goto("/settings/helper-areas");
  await page
    .getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "เพิ่มพื้นที่รับคำขอ" });
  await editor.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
  await expect(
    editor.getByRole("button", { name: "ยืนยันจุดนี้", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "ตำแหน่งของฉัน", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "ยืนยันจุดนี้", exact: true })
    .click();
  await editor.getByLabel("ชื่อพื้นที่รับคำขอ").fill("พื้นที่ทดสอบจริง");
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/measurement-requests/helper/locations") &&
      r.request().method() === "POST",
  );
  await editor
    .getByRole("button", { name: "บันทึกและเปิดรับคำขอ", exact: true })
    .click();
  expect((await created).status()).toBe(201);
  await expect(editor).toHaveCount(0);
  const first = await (
    await page.request.get("/api/measurement-requests/helper")
  ).json();
  expect(first.locations).toHaveLength(1);
  expect(first.locations[0].lat).toBeCloseTo(13.82, 4);
  expect(first.locations[0].lon).toBeCloseTo(100.06, 4);
  const slot = first.locations[0].slot;
  await page
    .getByRole("button", { name: "แก้ไขสถานที่ พื้นที่ทดสอบจริง", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "แก้ไขพื้นที่รับคำขอ" });
  await edit.getByLabel("ชื่อพื้นที่รับคำขอ").fill("พื้นที่ที่แก้ไขแล้ว");
  const updated = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/measurement-requests/helper/locations/${slot}`) &&
      r.request().method() === "PATCH",
  );
  await edit
    .getByRole("button", { name: "บันทึกพื้นที่", exact: true })
    .click();
  expect((await updated).status()).toBe(200);
  await expect(edit).toHaveCount(0);
  await page
    .getByRole("button", { name: "ลบสถานที่ พื้นที่ที่แก้ไขแล้ว", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "ยืนยันลบสถานที่ พื้นที่ที่แก้ไขแล้ว",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/measurement-requests/helper")
          ).json()
        ).locations.length,
    )
    .toBe(0);
});
