import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// ในโหมด dev: Next (port 3000) จะ proxy /api/* ไปที่ FastAPI (uvicorn, port 8000)
// ในโหมด prod: Vercel route /api/* ไปที่ Python function เอง (ดู vercel.json)
const isDev = process.env.NODE_ENV === "development";
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // ปิด StrictMode: react-leaflet จะ throw "Map container is being reused"
  // เมื่อ StrictMode double-mount ใน dev (prod ไม่กระทบ — flag นี้มีผลเฉพาะ dev)
  reactStrictMode: false,
  // ระบุ root ชัดเจน (มี lockfile อื่นใน home dir ทำให้ Next เดา root ผิด)
  turbopack: { root: projectRoot },
  async rewrites() {
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
