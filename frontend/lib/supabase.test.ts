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
