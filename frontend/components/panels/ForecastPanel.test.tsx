import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ForecastResponse, Station } from "@/frontend/types";

import ForecastPanel from "./ForecastPanel";

afterEach(cleanup);

const station: Station = {
  id: "station-1",
  name_th: "สถานีทดสอบ",
  name_en: null,
  lat: 13.8,
  lon: 100.1,
  province: "นครปฐม",
  pm25: 18,
  aqi: null,
  color: null,
  level: null,
  recorded_at: null,
  data_status: "fresh",
  age_minutes: 5,
  eligible_for_surface: true,
  in_service_area: true,
  quality_flags: [],
};

const unavailableForecast = {
  forecast_status: "unavailable",
  points: [],
  sources: [],
} as unknown as ForecastResponse;

describe("ForecastPanel paused UI", () => {
  it("shows the complete UI structure without inventing a forecast value", () => {
    render(
      <ForecastPanel
        station={station}
        data={unavailableForecast}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByText("กำลังพัฒนา")).not.toBeNull();
    expect(screen.getByText("ยังไม่มีค่าพยากรณ์")).not.toBeNull();
    expect(screen.getByText("ช่วงค่าที่เป็นไปได้")).not.toBeNull();
    expect(screen.getByText("ข้อมูลที่จะใช้ประกอบ")).not.toBeNull();
    expect(screen.queryByText(/^0(?:\.0)?$/)).toBeNull();
  });

  it("does not invent timeline controls while the provider is unavailable", () => {
    render(
      <ForecastPanel
        station={station}
        data={unavailableForecast}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText("ช่วงเวลาพยากรณ์ยังไม่พร้อม")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "พยากรณ์ตามเวลา" })).toBeNull();
  });
});
