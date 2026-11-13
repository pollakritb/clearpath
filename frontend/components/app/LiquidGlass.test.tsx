import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LiquidGlass from "./LiquidGlass";

const mocks = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn() }));
vi.mock("@/frontend/lib/liquid-glass", () => ({
  mountLiquidGlass: mocks.mount,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("loads the enhancement outside development and releases it on unmount", async () => {
  mocks.mount.mockReturnValue(mocks.dispose);
  const view = render(<LiquidGlass />);
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  view.unmount();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it("does not start a delayed renderer after its owner unmounts", async () => {
  const view = render(<LiquidGlass />);
  view.unmount();
  await Promise.resolve();
  expect(mocks.mount).not.toHaveBeenCalled();
});
