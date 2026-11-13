"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { clearAccountData } from "@/frontend/lib/account-data-cache";
import { authenticatedFetch } from "@/frontend/lib/auth-request";
import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";

type UserRole = "user" | "moderator" | "admin";

interface AuthState {
  user: User | null;
  role: UserRole;
  loading: boolean;
  roleError: string | null;
  refreshRole: () => void;
  configured: boolean;
  localDemo: boolean;
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  signOut: (options?: { localOnly?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const subscribeToHydration = () => () => undefined;

async function fetchRole(session: Session | null): Promise<UserRole> {
  if (!session) return "user";
  const response = await authenticatedFetch(
    "/api/community/me/access",
    { cache: "no-store", signal: AbortSignal.timeout(15_000) },
    session.access_token,
  );
  if (!response.ok) throw new Error("ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
  const profile = (await response.json()) as { role?: UserRole };
  if (!["user", "moderator", "admin"].includes(profile.role ?? ""))
    throw new Error("ข้อมูลสิทธิ์ไม่ถูกต้อง กรุณาลองอีกครั้ง");
  return profile.role!;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = getSupabaseBrowserClient();
  const localDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === "true";
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [user, setUser] = useState<User | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const accountRef = useRef<string | null>(null);
  const [roleRevision, setRoleRevision] = useState(0);
  const refreshRole = useCallback(() => {
    setLoading(true);
    setRoleRevision((value) => value + 1);
  }, []);
  const [role, setRole] = useState<UserRole>("user");

  useEffect(() => {
    // Local demo bypasses configured Supabase auth; its role is exposed only
    // after hydration through useSyncExternalStore below.
    if (localDemo) return;
    if (!client) return;
    let active = true;
    let revision = 0;
    let lastToken: string | null | undefined;
    let lastUserId: string | null = accountRef.current;
    const applySession = (session: Session | null) => {
      if (!active) return;
      if (lastUserId !== (session?.user.id ?? null)) clearAccountData(true);
      setUser(session?.user ?? null);
      lastUserId = session?.user.id ?? null;
      accountRef.current = lastUserId;
      const token = session?.access_token ?? null;
      if (lastToken === token) return;
      lastToken = token;
      const requestRevision = ++revision;
      setRole("user");
      setRoleError(null);
      void fetchRole(session)
        .then((nextRole) => {
          if (!active || revision !== requestRevision) return;
          setRole(nextRole);
          setLoading(false);
        })
        .catch(() => {
          if (!active || revision !== requestRevision) return;
          setRoleError("ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
          setLoading(false);
        });
    };
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (revision === 0) applySession(data.session);
      })
      .catch(() => {
        if (active && revision === 0) {
          setRoleError("ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง");
          setLoading(false);
        }
      });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // A recovery refresh must not start another profile recovery loop.
      if (
        active &&
        event === "TOKEN_REFRESHED" &&
        session &&
        session.user.id === lastUserId
      ) {
        setUser(session.user);
        lastToken = session.access_token;
        return;
      }
      applySession(session);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client, localDemo, roleRevision]);

  useEffect(() => {
    const retry = () => {
      if (client && !localDemo && document.visibilityState !== "hidden")
        refreshRole();
    };
    window.addEventListener("focus", retry);
    return () => window.removeEventListener("focus", retry);
  }, [refreshRole, client, localDemo]);

  const signInWithOtp = useCallback(
    async (email: string) => {
      if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase Auth");
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
    },
    [client],
  );

  const signInWithGoogle = useCallback(
    async (returnTo?: string) => {
      if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase Auth");
      const destination = returnTo
        ? new URL(returnTo, window.location.origin)
        : null;
      const redirectTo =
        destination?.origin === window.location.origin
          ? destination.origin + destination.pathname
          : window.location.origin;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    },
    [client],
  );

  const signOut = useCallback(
    async (options?: { localOnly?: boolean }) => {
      if (client) {
        const { error } = await client.auth.signOut({
          scope: options?.localOnly ? "local" : "global",
        });
        if (error) throw error;
      }
      clearAccountData(true);
    },
    [client],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      roleError,
      refreshRole,
      role: localDemo && hydrated ? "admin" : role,
      loading: localDemo && hydrated ? false : loading,
      configured: Boolean(client),
      localDemo,
      signInWithGoogle,
      signInWithOtp,
      signOut,
    }),
    [
      user,
      roleError,
      refreshRole,
      role,
      loading,
      hydrated,
      client,
      localDemo,
      signInWithGoogle,
      signInWithOtp,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/** Identity used only to exclude the viewer's own public reports in the UI. */
export function useCurrentUserId(): string | null {
  const { user, localDemo } = useAuth();
  return (
    user?.id ?? (localDemo ? "00000000-0000-0000-0000-000000000001" : null)
  );
}
