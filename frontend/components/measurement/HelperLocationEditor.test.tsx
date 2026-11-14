import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HelperLocationEditor from "./HelperLocationEditor";
const reverse = vi.hoisted(() => vi.fn());
vi.mock("@/frontend/lib/api-client", () => ({
  api: { reverseLocation: reverse },
}));
const label = {
  name: "บริเวณมหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตกำแพงแสน",
  address: "อำเภอกำแพงแสน · จังหวัดนครปฐม",
  source: "photon",
};
beforeEach(() => {
  vi.clearAllMocks();
  reverse.mockResolvedValue(label);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(cleanup);
it.each(["", "บ้านทะเลบก · จังหวัดนครปฐม"])(
  "resolves an existing home with old/missing address %s while preserving its custom name",
  async (address) => {
    const save = vi.fn();
    render(
      <HelperLocationEditor
        initial={{
          slot: 1,
          name: "บ้าน",
          lat: 14.023,
          lon: 99.974,
          address,
          enabled: true,
        }}
        onSave={save}
        onClose={() => {}}
        busy={false}
        error=""
        first={false}
      />,
    );
    const d = within(screen.getByRole("dialog"));
    await waitFor(() => expect(reverse).toHaveBeenCalledWith(14.023, 99.974));
    await d.findByText(`${label.name} · ${label.address}`);
    fireEvent.click(d.getByRole("button", { name: /^บันทึกพื้นที่$/ }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "บ้าน",
        lat: 14.023,
        lon: 99.974,
        address: `${label.name} · ${label.address}`,
      }),
      1,
    );
  },
);
