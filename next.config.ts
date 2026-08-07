import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// ในโหมด dev: Next (port 3000) จะ proxy /api/* ไปที่ FastAPI (uvicorn, port 8000)
// ในโหมด prod: Vercel route /api/* ไปที่ Python function เอง (ดู vercel.json)
const isDev = process.env.NODE_ENV === "development";
const enableLocalApiProxy =
  isDev || process.env.ENABLE_LOCAL_API_PROXY === "true";
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} wss://${new URL(supabaseOrigin).host}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(!isDev ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // ปิด StrictMode: react-leaflet จะ throw "Map container is being reused"
  // เมื่อ StrictMode double-mount ใน dev (prod ไม่กระทบ — flag นี้มีผลเฉพาะ dev)
  reactStrictMode: false,
  // ระบุ root ชัดเจน (มี lockfile อื่นใน home dir ทำให้ Next เดา root ผิด)
  turbopack: { root: projectRoot },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), geolocation=(self), microphone=(), browsing-topics=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(!isDev
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
  async rewrites() {
    if (!enableLocalApiProxy) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
