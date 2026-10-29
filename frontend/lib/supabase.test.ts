import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";

const mockedCreateClient = vi.mocked(createClient);

async function loadModule() {
  return import("./supabase");
}

describe("Supabase browser session boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockedCreateClient.mockReset();
  });

  it("stays disabled when public browser configuration is incomplete", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getAccessToken, getSupabaseBrowserClient } = await loadModule();

    expect(getSupabaseBrowserClient()).toBeNull();
    expect(getSupabaseBrowserClient()).toBeNull();
    await expect(getAccessToken()).resolves.toBeNull();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("creates one client and returns its active access token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://clearpath.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "session-token" } },
        })),
      },
    };
    mockedCreateClient.mockReturnValue(client as never);
    const { getAccessToken, getSupabaseBrowserClient } = await loadModule();

    expect(getSupabaseBrowserClient()).toBe(client);
    expect(getSupabaseBrowserClient()).toBe(client);
    await expect(getAccessToken()).resolves.toBe("session-token");
    expect(mockedCreateClient).toHaveBeenCalledOnce();
  });

  it("returns null when Supabase has no active session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://clearpath.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    mockedCreateClient.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    } as never);
    const { getAccessToken } = await loadModule();

    await expect(getAccessToken()).resolves.toBeNull();
  });
});

it("shares one session refresh across concurrent rejected reads", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://clearpath.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  let finish!: (value: unknown) => void;
  const refreshSession = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mockedCreateClient.mockReturnValue({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "old" } },
      })),
      refreshSession,
    },
  } as never);
  const { refreshAccessToken } = await loadModule();
  const first = refreshAccessToken("old");
  const second = refreshAccessToken("old");
  await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  finish({ data: { session: { access_token: "new" } }, error: null });
  expect(await Promise.all([first, second])).toEqual(["new", "new"]);
  vi.unstubAllEnvs();
  vi.resetModules();
  mockedCreateClient.mockReset();
});

it("never clears a newer login when an older request is rejected", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://clearpath.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  const signOut = vi.fn();
  mockedCreateClient.mockReturnValue({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "new-login" } },
      })),
      signOut,
    },
  } as never);
  const { clearRejectedSession } = await loadModule();
  await clearRejectedSession("old-login");
  expect(signOut).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.resetModules();
  mockedCreateClient.mockReset();
});

it.each([403, 503])(
  "handles refresh failure status %s without signing out other devices",
  async (status) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://clearpath.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const signOut = vi.fn(async () => ({ error: null }));
    mockedCreateClient.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "old" } },
        })),
        refreshSession: vi.fn(async () => ({
          data: { session: null },
          error: { status },
        })),
        signOut,
      },
    } as never);
    const { refreshAccessToken } = await loadModule();
    expect(await refreshAccessToken("old")).toBeNull();
    if (status === 403)
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    else expect(signOut).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.resetModules();
    mockedCreateClient.mockReset();
  },
);
