import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CamsForecastControls from "./CamsForecastControls";
import type { useForecastGrid } from "@/frontend/hooks/useForecastGrid";
afterEach(cleanup);
const at = "2030-01-01T00:00:00Z";
const grid = {
  at,
  requestedAt: at,
  times: [at],
  meta: null,
  loading: false,
  error: null,
  surface: {
    latitudes: [13, 14],
    longitudes: [100, 101],
    values: [20, 20, 20, 20],
    validAt: at,
    generationId: "g",
  },
  select: vi.fn(),
  now: vi.fn(),
  togglePlay: vi.fn(),
  pause: vi.fn(),
  retry: vi.fn(),
  preparedFrames: 1,
} as unknown as ReturnType<typeof useForecastGrid>;
it("distinguishes outside Thailand from missing grid data and keeps the foreign point free of a request action", () => {
  render(
    <CamsForecastControls
      grid={grid}
      point={{ lat: 17.9757, lon: 102.6331 }}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText("นอกขอบเขตข้อมูลกริด")).toBeTruthy();
  expect(screen.queryByText("ไม่มีข้อมูล")).toBeNull();
  expect(screen.queryByText("ขอให้ชุมชนช่วยวัดบริเวณนี้ →")).toBeNull();
});
it("still shows forecast values and the community action for a point in Thailand", () => {
  render(
    <CamsForecastControls
      grid={grid}
      point={{ lat: 13.75, lon: 100.5 }}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText("20.0")).toBeTruthy();
  expect(screen.getByText("ขอให้ชุมชนช่วยวัดบริเวณนี้ →")).toBeTruthy();
});

it("shows a received foreign grid cell without a community request action", () => {
  const foreignGrid = {
    ...grid,
    surface: {
      ...grid.surface!,
      latitudes: [17.6, 18],
      longitudes: [102.4, 102.8],
    },
  };
  render(
    <CamsForecastControls
      grid={foreignGrid}
      point={{ lat: 17.9757, lon: 102.6331 }}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText("20.0")).toBeTruthy();
  expect(screen.queryByText("ขอให้ชุมชนช่วยวัดบริเวณนี้ →")).toBeNull();
});

it("offers a working retry when the forecast service is unavailable", () => {
  render(
    <CamsForecastControls
      grid={{ ...grid, error: "โหลดพยากรณ์ไม่สำเร็จ" }}
      point={null}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ลองโหลดพยากรณ์ใหม่" }));
  expect(grid.retry).toHaveBeenCalledOnce();
});

it("starts compact with time and playback while keeping the legend and day picker in the full panel", () => {
  render(
    <CamsForecastControls
      grid={{ ...grid, times: [at, "2030-01-01T01:00:00Z"] }}
      point={null}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    screen.getByRole("slider", { name: "เลือกเวลาพยากรณ์ CAMS" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toBeNull();
  expect(
    screen
      .queryByLabelText("ระดับ PM2.5 หน่วยไมโครกรัมต่อลูกบาศก์เมตร")
      ?.closest('[aria-hidden="true"]'),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  );
  expect(
    screen
      .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen.getByRole("combobox", { name: "เลือกวันพยากรณ์" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  );
  expect(
    screen
      .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});
it("keeps the toolbar compact and shows the selected cell without opening supporting details", () => {
  const props = {
    grid,
    point: null,
    onClosePoint: vi.fn(),
    onRequest: vi.fn(),
    onExit: vi.fn(),
  };
  const { rerender } = render(<CamsForecastControls {...props} />);
  rerender(
    <CamsForecastControls {...props} point={{ lat: 13.75, lon: 100.5 }} />,
  );
  expect(
    screen
      .getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    screen.getByRole("button", { name: "ขอให้ชุมชนช่วยวัดบริเวณนี้ →" }),
  ).toBeTruthy();
});

it("keeps one recovery action when a frame is unavailable", () => {
  render(
    <CamsForecastControls
      grid={{ ...grid, noFrame: true }}
      point={null}
      onClosePoint={vi.fn()}
      onRequest={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  );
  expect(
    screen.getAllByRole("button", { name: "ลองโหลดพยากรณ์ใหม่" }),
  ).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toBe("ไม่มีข้อมูลช่วงนี้");
});

it("positions the marker on a numeric scale and follows the displayed frame", () => {
  const props = {
    grid,
    point: { lat: 13.75, lon: 100.5 },
    onClosePoint: vi.fn(),
    onRequest: vi.fn(),
    onExit: vi.fn(),
  };
  const { rerender } = render(<CamsForecastControls {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "เลื่อนแผงข้อมูลขึ้นลง" }),
  );
  expect(
    screen.getByRole("img", {
      name: "จุดที่เลือก 20.0 µg/m³ · ปานกลาง (เริ่มเฝ้าระวัง)",
    }).style.left,
  ).toBe("10%");
  rerender(
    <CamsForecastControls
      {...props}
      grid={{
        ...grid,
        surface: { ...grid.surface!, values: [100, 100, 100, 100] },
      }}
    />,
  );
  expect(
    screen.getByRole("img", { name: "จุดที่เลือก 100.0 µg/m³ · มีผลกระทบ" })
      .style.left,
  ).toBe("50%");
  for (const [reading, percent] of [
    [10, 5],
    [12, 6],
    [30, 15],
    [40, 20],
    [250, 100],
  ]) {
    rerender(
      <CamsForecastControls
        {...props}
        grid={{
          ...grid,
          surface: {
            ...grid.surface!,
            values: [reading, reading, reading, reading],
          },
        }}
      />,
    );
    expect(screen.getByRole("img", { name: /จุดที่เลือก/ }).style.left).toBe(
      `${percent}%`,
    );
  }
  rerender(<CamsForecastControls {...props} point={null} />);
  expect(screen.queryByRole("img", { name: /จุดที่เลือก/ })).toBeNull();
  rerender(<CamsForecastControls {...props} point={{ lat: 30, lon: 110 }} />);
  expect(screen.queryByRole("img", { name: /จุดที่เลือก/ })).toBeNull();
});
