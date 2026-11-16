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
    await expect
      .poll(async () => {
        const sheet = page.getByRole("region", {
          name: "พยากรณ์ PM2.5 · CAMS",
          exact: true,
        });
        const buttons = page.getByRole("group", {
          name: /ควบคุมแผนที่ ระดับซูม/,
        });
        const a = (await buttons.boundingBox())!,
          b = (await sheet.boundingBox())!;
        return a.y + a.height <= b.y;
      })
      .toBe(true);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          document.documentElement.dataset.locateCalls = String(
            Number(document.documentElement.dataset.locateCalls ?? 0) + 1,
          );
          success({
            coords: { latitude: 13.75, longitude: 100.2, accuracy: 10 },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });
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
  const request = page.getByRole("button", { name: "ขอค่าฝุ่น", exact: true });
  await expect(request).toHaveCount(1);
  const controls = page.getByRole("group", { name: /ควบคุมแผนที่ ระดับซูม/ });
  await expect
    .poll(async () => {
      const controlBox = (await controls.boundingBox())!;
      const requestBox = (await request.boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      return (
        controlBox.y + controlBox.height <= panelBox.y &&
        (controlBox.x >= requestBox.x + requestBox.width ||
          controlBox.y >= requestBox.y + requestBox.height)
      );
    })
    .toBe(true);
  const mapArea = page.locator(".leaflet-container");
  const mapBox = (await mapArea.boundingBox())!;
  await mapArea.click({
    position: { x: mapBox.width / 2, y: mapBox.height / 3 },
  });
  await expect(
    panel.getByRole("region", { name: "ค่าพยากรณ์บริเวณที่เลือก" }),
  ).toHaveCount(1);
  await controls.getByRole("button", { name: "กลับมุมมองแผนที่กว้าง" }).tap();
  await expect(
    panel.getByRole("region", { name: "ค่าพยากรณ์บริเวณที่เลือก" }),
  ).toHaveCount(0);
  await controls.getByRole("button", { name: "ตำแหน่งของฉัน" }).tap();
  await expect(controls).toHaveAttribute("data-zoom", "15");
  await expect(
    panel.getByRole("region", { name: "ค่าพยากรณ์บริเวณที่เลือก" }),
  ).toHaveCount(0);
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
  await expect
    .poll(async () => {
      const buttonBox = (await controls.boundingBox())!;
      const sheetBox = (await panel.boundingBox())!;
      const layersBox = (await page
        .getByRole("button", { name: "เลือกข้อมูลที่แสดงบนแผนที่" })
        .boundingBox())!;
      return (
        buttonBox.y + buttonBox.height <= sheetBox.y &&
        buttonBox.y >= layersBox.y + layersBox.height + 4
      );
    })
    .toBe(true);
  await controls.getByRole("button", { name: "ตำแหน่งของฉัน" }).tap();
  await expect(
    panel.getByRole("region", { name: "ค่าพยากรณ์บริเวณที่เลือก" }),
  ).toHaveCount(0);
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

test("CAMS selected-point marker follows the displayed forecast frame", async ({
  page,
}) => {
  const anchor = Math.floor(Date.now() / 3600000) * 3600000;
  const times = [0, 1].map((i) => new Date(anchor + i * 3600000).toISOString());
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        latitudes: Array.from({ length: 44 }, (_, i) => 4.4 + i * 0.4),
        longitudes: Array.from({ length: 26 }, (_, i) => 96.4 + i * 0.4),
        valid_times: times,
        retrieved_at: times[0],
        stale: false,
      },
    }),
  );
  await page.route("**/api/forecast-grid/frames?*", (route) =>
    route.fulfill({
      json: {
        generation_id: "CGN-000001",
        grid_version: "cams-global-0.4-th-v1",
        row_start: 0,
        column_start: 0,
        rows: 44,
        columns: 26,
        frames: times.map((valid_at, i) => ({
          valid_at,
          values: Array(1144).fill(i === 0 ? 20 : 40),
        })),
      },
    }),
  );
  await page.goto("/?layer=cams");
  const panel = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 · CAMS",
    exact: true,
  });
  const slider = panel.getByRole("slider");
  await expect(slider).toHaveAttribute("max", "1");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  const map = page.locator(".leaflet-container");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await panel.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }).click();
  const moderate = panel.getByRole("img", {
    name: "จุดที่เลือก 20.0 µg/m³ · ปานกลาง (เริ่มเฝ้าระวัง)",
  });
  await expect(moderate).toBeVisible();
  const original = await moderate.evaluate((e) => getComputedStyle(e).left);
  await slider.press("ArrowRight");
  const high = panel.getByRole("img", {
    name: "จุดที่เลือก 40.0 µg/m³ · ปานกลาง (เริ่มเฝ้าระวัง)",
  });
  await expect(high).toBeVisible();
  expect(
    parseFloat(await high.evaluate((e) => getComputedStyle(e).left)),
  ).toBeGreaterThan(parseFloat(original));
  await panel.getByRole("button", { name: "ปิดรายละเอียดพยากรณ์" }).click();
  await expect(panel.getByRole("img", { name: /จุดที่เลือก/ })).toHaveCount(0);
});

test("GPS permission error remains above the CAMS panel", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) =>
          error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    });
  });
  await page.route("**/api/forecast-grid/metadata", (route) =>
    route.fulfill({ status: 503, json: { detail: "โหลดพยากรณ์ไม่สำเร็จ" } }),
  );
  await page.goto("/?layer=cams");
  const panel = page.getByRole("region", {
    name: "พยากรณ์ PM2.5 · CAMS",
    exact: true,
  });
  await expect(panel.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).tap();
  const error = page.locator(".cp-mapctrls__error[role=alert]");
  await expect(error).toContainText("อนุญาตการเข้าถึงตำแหน่ง");
  await expect
    .poll(async () => {
      const a = (await error.boundingBox())!,
        b = (await panel.boundingBox())!;
      return a.y >= 0 && a.y + a.height <= b.y;
    })
    .toBe(true);
});
