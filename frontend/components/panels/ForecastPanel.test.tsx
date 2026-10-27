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

describe("ForecastPanel stored CAMS UI", () => {
  it("shows a clear unavailable state without inventing a forecast value", () => {
    render(
      <ForecastPanel
        station={station}
        data={unavailableForecast}
        loading={false}
        error={null}
      />,
    );

    expect(
      screen.getByText("ยังไม่มีพยากรณ์ CAMS ที่เก็บไว้สำหรับบริเวณนี้"),
    ).not.toBeNull();
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

    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "พยากรณ์ตามเวลา" })).toBeNull();
  });

  it("labels an area forecast separately from a station measurement", () => {
    const areaForecast = {
      target_kind: "area",
      station_id: null,
      forecast_status: "limited",
      forecast_mode: "external_provider",
      recommended_source: "openmeteo_cams",
      provider_count: 1,
      generated_at: "2026-10-15T01:00:00+00:00",
      fetched_at: "2026-10-15T01:00:00+00:00",
      points: [
        {
          horizon_hours: 1,
          forecast_at: "2026-10-15T02:00:00+00:00",
          valid_at: "2026-10-15T02:00:00+00:00",
          pm25: 12.5,
          lower: 12.5,
          upper: 12.5,
          source: "openmeteo_cams",
        },
      ],
      sources: [],
      providers: [],
      selection_evidence: { basis: "freshness_fallback" },
      limitation_reason_codes: [],
      grid_lat: 13.75,
      grid_lon: 100.25,
    } as unknown as ForecastResponse;
    render(
      <ForecastPanel
        station={null}
        areaLabel="ตลาดนครปฐม"
        data={areaForecast}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText("พยากรณ์ PM2.5 สำหรับบริเวณนี้")).not.toBeNull();
    expect(screen.getByText("ตลาดนครปฐม")).not.toBeNull();
    expect(screen.queryByText("ค่าตรวจวัด")).toBeNull();
    expect(
      screen.getByText(/เวลาถัดไปคือค่าพยากรณ์จาก CAMS Global/),
    ).not.toBeNull();
  });
});
