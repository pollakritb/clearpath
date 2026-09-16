import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}));

vi.mock("@/frontend/lib/supabase", () => ({
  getSupabaseBrowserClient: supabaseMocks.getClient,
}));

import { AuthProvider, useAuth } from "./AuthProvider";

let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  const auth = useAuth();
  useEffect(() => {
    latestAuth = auth;
  }, [auth]);
  return <span>{`${auth.role}:${auth.loading}`}</span>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    latestAuth = null;
    vi.unstubAllEnvs();
    supabaseMocks.getClient.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exposes safe unconfigured and local-demo states", async () => {
    supabaseMocks.getClient.mockReturnValue(null);
    const view = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(latestAuth).toMatchObject({
      user: null,
      role: "user",
      loading: false,
      configured: false,
      localDemo: false,
    });
    await expect(latestAuth?.signInWithGoogle()).rejects.toBeInstanceOf(Error);
    await expect(
      latestAuth?.signInWithOtp("user@example.com"),
    ).rejects.toBeInstanceOf(Error);
    await expect(latestAuth?.signOut()).resolves.toBeUndefined();
    view.unmount();

    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEMO_MODE", "true");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(latestAuth).toMatchObject({ role: "admin", localDemo: true });
  });

  it("loads the server role and delegates sign-in and sign-out", async () => {
    const session = {
      access_token: "access-token",
      user: { id: "user-1", email: "user@example.com" },
    };
    const unsubscribe = vi.fn();
    let authChange: ((_event: string, session: unknown) => void) | undefined;
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session } })),
        onAuthStateChange: vi.fn((callback) => {
          authChange = callback;
          return { data: { subscription: { unsubscribe } } };
        }),
        signInWithOAuth: vi.fn(async () => ({ error: null })),
        signInWithOtp: vi.fn(async () => ({ error: null })),
        signOut: vi.fn(async () => undefined),
      },
    };
    supabaseMocks.getClient.mockReturnValue(client);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ role: "admin" }), { status: 200 }),
    );

    const view = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(latestAuth?.loading).toBe(false));
    expect(latestAuth).toMatchObject({
      user: session.user,
      role: "admin",
      configured: true,
    });
    expect(fetch).toHaveBeenCalledWith("/api/community/me", {
      headers: { Authorization: "Bearer access-token" },
    });

    await act(async () => latestAuth?.signInWithGoogle());
    await act(async () => latestAuth?.signInWithOtp("user@example.com"));
    await act(async () => latestAuth?.signOut());
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: window.location.origin },
    });
    expect(client.auth.signOut).toHaveBeenCalledOnce();

    act(() => authChange?.("SIGNED_OUT", null));
    await waitFor(() => expect(latestAuth?.role).toBe("user"));
    expect(latestAuth?.user).toBeNull();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("falls back to user when role lookup or sign-in fails", async () => {
    const oauthError = new Error("oauth failed");
    const otpError = new Error("otp failed");
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: { access_token: "token", user: { id: "user-1" } },
          },
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signInWithOAuth: vi.fn(async () => ({ error: oauthError })),
        signInWithOtp: vi.fn(async () => ({ error: otpError })),
        signOut: vi.fn(),
      },
    };
    supabaseMocks.getClient.mockReturnValue(client);
    vi.mocked(fetch).mockRejectedValue(new Error("network failed"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(latestAuth?.loading).toBe(false));
    expect(latestAuth?.role).toBe("user");
    await expect(latestAuth?.signInWithGoogle()).rejects.toBe(oauthError);
    await expect(latestAuth?.signInWithOtp("user@example.com")).rejects.toBe(
      otpError,
    );
  });

  it("requires consumers to be nested inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(
      "useAuth must be used inside AuthProvider",
    );
  });
});
