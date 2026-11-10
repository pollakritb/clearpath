import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PlaceAirCard from "./PlaceAirCard";
import type { PlaceAir } from "@/frontend/lib/place-air";
vi.mock("./MapStationForecast", () => ({ default: () => null }));
afterEach(cleanup);
const place = {
  id: "mall",
  name: "Central Embassy",
  address: "กรุงเทพมหานคร",
  lat: 13.74,
  lon: 100.54,
  kind: "mall",
  source: "local" as const,
};
const empty: PlaceAir = {
  value: null,
  method: "unavailable",
  contributors: [],
  stations: [],
  reports: [],
  nearestStation: null,
};
const callbacks = {
  onClose: vi.fn(),
  onSelectStation: vi.fn(),
  onSelectReport: vi.fn(),
  onRequestMeasurement: vi.fn(),
};
it("opens with a short summary and a useful action when no current data exists", () => {
  render(
    <PlaceAirCard
      place={place}
      air={empty}
      loading={false}
      dataError={null}
      {...callbacks}
    />,
  );
  expect(
    screen
      .getByRole("region", { name: "ค่าฝุ่นรอบ Central Embassy" })
      .getAttribute("data-snap"),
  ).toBe("peek");
  expect(screen.getByText("ยังไม่มีค่าปัจจุบัน")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  ).toBeNull();
  expect(
    screen.queryByRole("heading", { name: /สถานีใกล้เคียง|รายงานจากชุมชน/ }),
  ).toBeNull();
});
it("keeps old station readings distinct from a current estimate and omits empty sections", () => {
  const air = {
    ...empty,
    stations: [
      {
        station: { id: "50t", name_th: "สถานีใกล้ห้าง", pm25: 13.5 },
        distanceKm: 1.5,
        ageMinutes: 540,
        usable: false,
      },
    ],
  } as PlaceAir;
  render(
    <PlaceAirCard
      place={place}
      air={air}
      loading={false}
      dataError={null}
      {...callbacks}
    />,
  );
  expect(screen.getByText("ยังไม่มีข้อมูลที่ใช้ประเมินได้")).toBeTruthy();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
    { key: "End" },
  );
  fireEvent.click(screen.getByText("ข้อมูลอื่นที่ไม่ใช้คำนวณ (1)"));
  expect(
    screen
      .getByRole("button", {
        name: /สถานีใกล้ห้าง.*9 ชม.ที่แล้ว.*ไม่ผ่านเกณฑ์/,
      })
      .getAttribute("data-stale"),
  ).toBe("true");
  expect(screen.queryByRole("heading", { name: /รายงานจากชุมชน/ })).toBeNull();
  expect(
    screen.queryByRole("region", { name: "พยากรณ์ PM2.5 รายชั่วโมง" }),
  ).toBeNull();
});
it("prioritizes the estimate and moves the request action below the summary when data is present", () => {
  render(
    <PlaceAirCard
      place={place}
      air={{ ...empty, value: 18.5, method: "idw" }}
      loading={false}
      dataError={null}
      {...callbacks}
    />,
  );
  expect(screen.getByText("18.5")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  ).toBeNull();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
    { key: "End" },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "ขอให้ช่วยวัดบริเวณนี้" }),
  );
  expect(callbacks.onRequestMeasurement).toHaveBeenCalledOnce();
});

it("labels a single community source and keeps excluded readings behind a disclosure", () => {
  const air = {
    ...empty,
    value: 34,
    method: "idw",
    contributors: [
      { source: "report", id: "new", pm25: 34, distanceKm: 0.451, weight: 1 },
    ],
    reports: [
      {
        report: { id: "new", display_name: "ผู้ช่วยวัด", pm25: 34 },
        distanceKm: 0.451,
        ageMinutes: 120,
        usable: true,
      },
      {
        report: { id: "old", display_name: "ผู้ช่วยวัด", pm25: 80 },
        distanceKm: 0.452,
        ageMinutes: 140,
        usable: false,
        exclusion: "older",
      },
    ],
    stations: [
      {
        station: { id: "stale", name_th: "สถานีเก่า", pm25: 20.5 },
        distanceKm: 1.3,
        ageMinutes: 90,
        usable: false,
      },
    ],
  } as PlaceAir;
  render(
    <PlaceAirCard
      place={place}
      air={air}
      loading={false}
      dataError={null}
      {...callbacks}
    />,
  );
  expect(screen.getByText("อ้างอิง ผู้รายงาน 1 คน")).toBeTruthy();
  expect(screen.getByText("2 ชม.ที่แล้ว · ประมาณ 451 ม.")).toBeTruthy();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
    { key: "End" },
  );
  expect(screen.getByText(/ใช้ข้อมูลจุดเดียว ไม่ได้เฉลี่ย/)).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: /รายงานที่ใช้คำนวณ/ }),
  ).toBeTruthy();
  expect(
    screen
      .getByText("ข้อมูลอื่นที่ไม่ใช้คำนวณ (2)")
      .closest("details")
      ?.hasAttribute("open"),
  ).toBe(false);
  fireEvent.click(screen.getByText("ข้อมูลอื่นที่ไม่ใช้คำนวณ (2)"));
  expect(screen.getByRole("button", { name: /สถานีเก่า/ })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /มีรายงานใหม่กว่าจากคนนี้/ }),
  ).toBeTruthy();
});

it("explains the hourly publication gap in minutes without rounding it to one hour", () => {
  const air = {
    ...empty,
    stations: [
      {
        station: { id: "late", name_th: "สถานีรออัปเดต", pm25: 10.2 },
        distanceKm: 1.3,
        ageMinutes: 67,
        usable: false,
      },
    ],
  } as PlaceAir;
  render(
    <PlaceAirCard
      place={place}
      air={air}
      loading={false}
      dataError={null}
      {...callbacks}
    />,
  );
  fireEvent.keyDown(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
    { key: "End" },
  );
  fireEvent.click(screen.getByText("ข้อมูลอื่นที่ไม่ใช้คำนวณ (1)"));
  expect(
    screen.getByRole("button", { name: /สถานีรออัปเดต.*67 นาทีที่แล้ว/ }),
  ).toBeTruthy();
  expect(screen.getByText("ยังไม่มีค่าปัจจุบัน")).toBeTruthy();
});
