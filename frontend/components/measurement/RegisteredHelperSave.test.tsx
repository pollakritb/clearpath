import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MeasurementHelperLocationWrite } from "@/frontend/types";
import RegisteredHelperSettings from "./RegisteredHelperSettings";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  enable: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/frontend/lib/api-client", () => ({
  api: {
    reverseLocation: vi.fn(async () => ({
      name: "",
      address: "",
      source: "local",
    })),
    saveMeasurementLocation: mocks.save,
    setMeasurementHelper: mocks.enable,
    measurementHelper: mocks.settings,
  },
  apiErrorMessage: () => "บันทึกไม่สำเร็จ",
}));
vi.mock("./HelperLocationEditor", () => ({
  default: ({
    onSave,
    error,
    busy,
  }: {
    onSave: (value: MeasurementHelperLocationWrite) => void;
    error: string;
    busy: boolean;
  }) => (
    <div>
      <button
        disabled={busy}
        onClick={() =>
          onSave({
            name: "บ้าน",
            address: "นครปฐม",
            lat: 13.82,
            lon: 100.06,
            enabled: true,
          })
        }
      >
        บันทึกพื้นที่ทดสอบ
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));
const area = {
  slot: 1,
  name: "บ้าน",
  address: "นครปฐม",
  lat: 13.82,
  lon: 100.06,
  enabled: true,
};
const empty = {
  enabled: false,
  observed_at: null,
  registered_locations_enabled: true,
  locations: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(area);
  mocks.enable.mockResolvedValue({});
  mocks.settings.mockResolvedValue({
    ...empty,
    enabled: true,
    locations: [area],
  });
});
afterEach(cleanup);
it("creates a new area without a slot and retries an incomplete enable using its returned slot", async () => {
  mocks.enable.mockRejectedValueOnce(new Error("offline"));
  const changed = vi.fn();
  render(<RegisteredHelperSettings settings={empty} onChange={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ" }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกพื้นที่ทดสอบ" }));
  await screen.findByRole("alert");
  expect(mocks.save.mock.calls[0][1]).toBeUndefined();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกพื้นที่ทดสอบ" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[1][1]).toBe(1);
  expect(
    screen.queryByRole("button", { name: "บันทึกพื้นที่ทดสอบ" }),
  ).toBeNull();
});
it("retries a failed create as another create rather than patching a missing slot", async () => {
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  const changed = vi.fn();
  render(<RegisteredHelperSettings settings={empty} onChange={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มพื้นที่รับคำขอ" }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกพื้นที่ทดสอบ" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกพื้นที่ทดสอบ" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls.map((call) => call[1])).toEqual([
    undefined,
    undefined,
  ]);
});
