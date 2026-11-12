import { test, expect, type Page } from "@playwright/test";

// Keep the exhaustive sweep opt-in on CI; regular request regressions stay fast.
test.skip(
  Boolean(process.env.CI) && process.env.RUN_REQUEST_PATH_STRESS !== "true",
  "Set RUN_REQUEST_PATH_STRESS=true for the 1000-path sweep",
);

const widths = [320, 360, 390, 430];
type Step = "search" | "pick" | "form";
type Action =
  | "map"
  | "search"
  | "back"
  | "confirm"
  | "reselect"
  | "now"
  | "scheduled"
  | "details";
function makePath(seed: number): Action[] {
  let state = seed + 1;
  const random = (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
  const path: Step[] = ["search"];
  const actions: Action[] = [];
  for (let i = 0; i < 12; i++) {
    const step = path.at(-1)!;
    const choices: Action[] =
      step === "search"
        ? path.length > 1
          ? ["map", "back"]
          : ["map"]
        : step === "pick"
          ? ["search", "back", "confirm"]
          : ["reselect", "now", "scheduled", "details"];
    const action = choices[random(choices.length)];
    actions.push(action);
    if (action === "map") path.push("pick");
    if (action === "search") path.push("search");
    if (action === "confirm") path.push("form");
    if (action === "back") path.pop();
    if (action === "reselect") path.splice(path.lastIndexOf("pick") + 1);
  }
  return actions;
}
// Generate distinct action sequences once, independently of viewport variants.
const paths: Action[][] = [];
const unique = new Set<string>();
for (let seed = 0; paths.length < 1000; seed++) {
  const path = makePath(seed);
  const key = path.join(",");
  if (!unique.has(key)) {
    unique.add(key);
    paths.push(path);
  }
  if (seed > 1000000) throw new Error("Could not generate 1000 distinct paths");
}
const sheet = (page: Page) =>
  page.getByRole("region", { name: "ขอค่าฝุ่นบนแผนที่", exact: true });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

for (let batch = 0; batch < 10; batch++) {
  test(`1000 request paths: batch ${batch + 1}/10`, async ({ page }, info) => {
    test.setTimeout(600000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const width = page.viewportSize()!.width;
    const start = widths.indexOf(width) * 250 + batch * 25;
    expect(start).toBeGreaterThanOrEqual(0);
    const results: object[] = [];
    let row: Record<string, unknown> | null = null;
    let failNext = false;
    let sends = 0;
    await page.route("**/api/locations/reverse?*", (route) =>
      route.fulfill({ json: { name: "พื้นที่ทดสอบ", address: "นครปฐม" } }),
    );
    await page.route("**/api/measurement-requests", (route) => {
      if (route.request().method() === "POST") {
        sends++;
        if (failNext) {
          failNext = false;
          return route.fulfill({
            status: 503,
            json: { detail: "ทดสอบลองใหม่" },
          });
        }
        row = {
          ...route.request().postDataJSON(),
          id: "REQ-1000",
          is_owner: true,
          status: "active",
          starts_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString(),
          recipient_count: 1,
        };
        return route.fulfill({ status: 201, json: row });
      }
      return route.fulfill({ json: { requests: row ? [row] : [] } });
    });
    await page.route("**/api/measurement-requests/REQ-1000/cancel", (route) => {
      row = { ...row, status: "cancelled" };
      return route.fulfill({ json: row });
    });
    await page.goto("/");
    try {
      for (let index = start; index < start + 25; index++) {
        const actions = paths[index];
        const traversed: string[] = [];
        try {
          await button(page, "ขอค่าฝุ่น").click();
          const stack: Step[] = ["search"];
          let scheduled = false;
          let details = false;
          for (const action of actions) {
            traversed.push(action);
            switch (action) {
              case "map":
                await page
                  .getByRole("button", { name: /เลือกบนแผนที่/ })
                  .click();
                stack.push("pick");
                break;
              case "search":
                await button(page, "ค้นหาหรือแก้ไขสถานที่ขอค่าฝุ่น").click();
                stack.push("search");
                break;
              case "back": {
                const step = stack.pop();
                await button(
                  page,
                  step === "pick"
                    ? "กลับขั้นก่อนหน้า"
                    : stack.at(-1) === "pick"
                      ? "กลับไปเลือกจุดบนแผนที่"
                      : "กลับไปแผนที่",
                ).click();
                break;
              }
              case "confirm":
                await button(page, "ใช้จุดนี้เพื่อขอค่าฝุ่น").click();
                stack.push("form");
                details = false;
                break;
              case "reselect":
                await button(page, "กลับไปเลือกจุดบนแผนที่").click();
                stack.splice(stack.lastIndexOf("pick") + 1);
                break;
              case "now":
                await button(page, "ตอนนี้").click();
                scheduled = false;
                break;
              case "scheduled": {
                await button(page, "ก่อนเวลาที่กำหนด").click();
                scheduled = true;
                await sheet(page)
                  .getByLabel("ต้องการข้อมูลก่อน (ภายใน 24 ชม.)")
                  .fill(
                    new Date(Date.now() + 3600000 + 7 * 3600000)
                      .toISOString()
                      .slice(0, 16),
                  );
                break;
              }
              case "details":
                await sheet(page)
                  .getByText("รายละเอียดการส่งคำขอ", { exact: true })
                  .click();
                details = !details;
                break;
            }
            const current = stack.at(-1);
            if (current === "search")
              await expect(
                page.getByRole("region", { name: "เลือกพื้นที่ขอค่าฝุ่น" }),
              ).toBeVisible();
            if (current === "pick")
              await expect(
                button(page, "ใช้จุดนี้เพื่อขอค่าฝุ่น"),
              ).toBeVisible();
            if (current === "form") {
              await expect(
                button(page, scheduled ? "ก่อนเวลาที่กำหนด" : "ตอนนี้"),
              ).toHaveAttribute("aria-pressed", "true");
              await expect(sheet(page).locator("details")).toHaveJSProperty(
                "open",
                details,
              );
            }
          }
          // Each distinct route ends by testing either explicit exit, Back to
          // root, or submission (including a recoverable error) and cancellation.
          const ending = index % 4;
          traversed.push(
            ["close", "back-to-root", "submit-cancel", "retry-keep-cancel"][
              ending
            ],
          );
          if (ending === 0) await button(page, "ปิดการขอค่าฝุ่น").click();
          else if (ending === 1) {
            while (stack.length) {
              const current = stack.pop();
              if (current === "form")
                await button(page, "กลับไปเลือกจุดบนแผนที่").click();
              else
                await button(
                  page,
                  current === "pick"
                    ? "กลับขั้นก่อนหน้า"
                    : stack.at(-1) === "pick"
                      ? "กลับไปเลือกจุดบนแผนที่"
                      : "กลับไปแผนที่",
                ).click();
            }
          } else {
            if (stack.at(-1) === "search")
              await page.getByRole("button", { name: /เลือกบนแผนที่/ }).click();
            if (stack.at(-1) !== "form")
              await button(page, "ใช้จุดนี้เพื่อขอค่าฝุ่น").click();
            await button(page, "ตอนนี้").click();
            await expect(button(page, "ส่งคำขอ")).toBeEnabled();
            const previousSends = sends;
            failNext = ending === 3;
            await button(page, "ส่งคำขอ").click();
            if (ending === 3) {
              await expect(sheet(page).getByRole("alert")).toBeVisible();
              await button(page, "ส่งคำขอ").click();
            }
            const card = page.getByRole("region", {
              name: "รายละเอียดจุดขอค่าฝุ่น",
            });
            await expect(card).toBeVisible();
            expect(sends - previousSends).toBe(ending === 3 ? 2 : 1);
            await card
              .getByRole("button", { name: "ยกเลิกคำขอ", exact: true })
              .click();
            if (ending === 3) {
              await button(page, "เก็บไว้").click();
              await button(page, "ยกเลิกคำขอ").click();
            }
            await button(page, "ยืนยันยกเลิกคำขอ").click();
            await expect(card).toHaveCount(0);
          }
          await expect(button(page, "ขอค่าฝุ่น")).toBeVisible();
          results.push({
            id: index + 1,
            width,
            actions: traversed,
            status: "passed",
          });
        } catch (error) {
          results.push({
            id: index + 1,
            width,
            actions: traversed,
            status: "failed",
            error: String(error),
          });
          throw error;
        }
      }
    } finally {
      await info.attach("request-path-results", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
    }
  });
}
