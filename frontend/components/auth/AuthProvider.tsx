"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getSupabaseBrowserClient } from "@/frontend/lib/supabase";

type UserRole = "user" | "moderator" | "admin";

interface AuthState {
  user: User | null;
  role: UserRole;
  loading: boolean;
  configured: boolean;
  localDemo: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchRole(session: Session | null): Promise<UserRole> {
  if (!session) return "user";
  try {
    const response = await fetch("/api/community/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return "user";
    const profile = (await response.json()) as { role?: UserRole };
    return profile.role ?? "user";
  } catch {
    return "user";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = getSupabaseBrowserClient();
  const localDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === "true";
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(localDemo ? "admin" : "user");
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setRole(await fetchRole(data.session));
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      void fetchRole(session).then((nextRole) => active && setRole(nextRole));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

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

  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut();
  }, [client]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      loading,
      configured: Boolean(client),
      localDemo,
      signInWithOtp,
      signOut,
    }),
    [user, role, loading, client, localDemo, signInWithOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
