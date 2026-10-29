"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && anonKey ? createClient(url, anonKey) : null;
  return browserClient;
}

export async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

let pendingRefresh: Promise<string | null> | null = null;

/** Clear only the rejected login on this device; never sign out other devices. */
export async function clearRejectedSession(
  rejectedToken: string,
): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (data.session?.access_token === rejectedToken)
    await client.auth.signOut({ scope: "local" });
}

/** Concurrent failed reads share one refresh, preserving rotated refresh tokens. */
export async function refreshAccessToken(
  rejectedToken: string,
): Promise<string | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const currentToken = await getAccessToken();
  if (!currentToken) return null;
  if (currentToken !== rejectedToken) return currentToken;
  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      const { data, error } = await client.auth.refreshSession();
      if (error) {
        if ([400, 401, 403].includes(error.status ?? 0))
          await clearRejectedSession(rejectedToken);
        return null;
      }
      return data.session?.access_token ?? null;
    })().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}
