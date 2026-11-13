import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SignOutButton from "./SignOutButton";
const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("./AuthProvider", () => ({ useAuth: () => mocks }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows failure and lets the user retry sign out", async () => {
  mocks.signOut
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  render(<SignOutButton />);
  fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
});
it("prevents another sign out while the first is pending", async () => {
  let finish!: () => void;
  mocks.signOut.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<SignOutButton />);
  const button = screen.getByRole("button", { name: "ออกจากระบบ" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.signOut).toHaveBeenCalledOnce();
  finish();
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("false"));
});
