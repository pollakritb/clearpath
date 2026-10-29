import {
  clearRejectedSession,
  getAccessToken,
  refreshAccessToken,
} from "./supabase";

/** Retry authenticated reads once after server rejection; never replay writes. */
export async function authenticatedFetch(
  url: string,
  init: RequestInit = {},
  sessionToken?: string,
): Promise<Response> {
  const token = sessionToken ?? (await getAccessToken());
  const send = (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    else headers.delete("Authorization");
    return fetch(url, { ...init, headers });
  };
  if (!token && process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE !== "true")
    return new Response(JSON.stringify({ detail: "กรุณาเข้าสู่ระบบก่อน" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  const response = await send(token);
  if (
    response.status !== 401 ||
    !token ||
    (init.method ?? "GET").toUpperCase() !== "GET"
  )
    return response;
  const refreshed = await refreshAccessToken(token);
  if (!refreshed) return response;
  const retry = await send(refreshed);
  if (retry.status === 401) await clearRejectedSession(refreshed);
  return retry;
}
