import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  refresh: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("./supabase", () => ({
  getAccessToken: mocks.token,
  refreshAccessToken: mocks.refresh,
  clearRejectedSession: mocks.clear,
}));
import { authenticatedFetch } from "./auth-request";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue("old-token");
  mocks.refresh.mockResolvedValue("new-token");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("retries a rejected profile read once with the refreshed token", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response("{}", { status: 200 }));
  expect((await authenticatedFetch("/api/community/me")).status).toBe(200);
  expect(mocks.refresh).toHaveBeenCalledWith("old-token");
  expect(
    new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get(
      "Authorization",
    ),
  ).toBe("Bearer new-token");
  expect(mocks.clear).not.toHaveBeenCalled();
});
it("clears only a session whose refreshed token is still rejected, without looping", async () => {
  vi.mocked(fetch).mockImplementation(
    async () => new Response(null, { status: 401 }),
  );
  expect((await authenticatedFetch("/api/community/me")).status).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mocks.clear).toHaveBeenCalledWith("new-token");
});
it("does not send anonymous profile requests outside local demo", async () => {
  vi.stubEnv("NEXT_PUBLIC_LOCAL_DEMO_MODE", "false");
  mocks.token.mockResolvedValue(null);
  expect((await authenticatedFetch("/api/community/me")).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not replay uploads or writes after a rejection", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
  await authenticatedFetch("/api/community/report-drafts", {
    method: "POST",
    body: new FormData(),
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("does not refresh a session for a profile service failure", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 502 }));
  expect((await authenticatedFetch("/api/community/me")).status).toBe(502);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
