import { expect, test } from "@playwright/test";

test("CAMS keeps playback compact and moves supporting information into the expanded panel", async ({
  page,
}) => {
  const anchor = Math.floor(Date.now() / 3600000) * 3600000;
  const times = Array.from({ length: 100 }, (_, i) =>
    new Date(anchor + i * 3600000).toISOString(),
  );
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        latitudes: [13.6, 14],
        longitudes: [100, 100.4],
        valid_times: times,
        retrieved_at: new Date(anchor).toISOString(),
        stale: false,
      },
    }),
  );
  await page.route("**/api/forecast-grid/frames?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        row_start: 0,
        column_start: 0,
        rows: 2,
        columns: 2,
        frames: times
          .filter(
            (t) =>
              Date.parse(t) >= Date.parse(q.get("start")!) &&
              Date.parse(t) <= Date.parse(q.get("end")!),
          )
          .map((valid_at) => ({ valid_at, values: [20, 20, 20, 20] })),
      },
    });
  });
  const interventions: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Ignored attempt to cancel"))
      interventions.push(message.text());
  });
  async function swipeGrip(direction: "up" | "down") {
    const grip = page.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" });
    const box = (await grip.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 6; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (direction === "up" ? -1 : 1) * i * 12 }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  }
  await page.goto("/?layer=cams");
  const panel = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 · CAMS",
    exact: true,
  });
  const slider = panel.getByRole("slider", { name: "เลือกเวลาพยากรณ์ CAMS" });
  await expect(slider).toHaveAttribute("max", "99");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeLessThan(125);
  const selected = panel.locator("header strong");
  expect(await selected.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await expect(
    panel.getByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toHaveCount(0);
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("1");
  await swipeGrip("up");
  await expect(
    panel.getByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toBeVisible();
  await expect(
    panel.getByLabel("ระดับ PM2.5 หน่วยไมโครกรัมต่อลูกบาศก์เมตร"),
  ).toBeVisible();
  await expect(
    panel.getByText("CAMS · 100 ช่วงเวลาที่เลือกได้", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("ข้อมูลพยากรณ์ CAMS").click();
  await panel
    .locator(":scope > div")
    .first()
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  await expect(panel.getByRole("slider")).toBeVisible();
  await swipeGrip("down");
  await expect(
    panel.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(slider).toBeVisible();
  expect(interventions).toEqual([]);
});

test("CAMS failure stays compact with one retry and no unusable timeline", async ({
  page,
}) => {
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({ status: 503, json: { detail: "โหลดพยากรณ์ไม่สำเร็จ" } }),
  );
  await page.goto("/?layer=cams");
  const panel = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 · CAMS",
    exact: true,
  });
  await expect(panel.getByRole("alert")).toContainText("โหลดพยากรณ์");
  await expect(
    panel.getByRole("button", { name: "ลองโหลดพยากรณ์ใหม่" }),
  ).toHaveCount(1);
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await panel.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }).click();
  await expect(panel.getByRole("button", { name: /ลอง/ })).toHaveCount(1);
});
