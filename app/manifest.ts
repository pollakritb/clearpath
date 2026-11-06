import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClearPath Community",
    short_name: "ClearPath",
    description: "พยากรณ์ PM2.5 และเครือข่ายข้อมูลคุณภาพอากาศชุมชน",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f6",
    theme_color: "#147BC1",
    lang: "th",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "อากาศวันนี้",
        short_name: "วันนี้",
        url: "/air",
        icons: [
          {
            src: "/clearpath-app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      {
        name: "ส่งข้อมูล PM2.5",
        short_name: "ส่งข้อมูล",
        url: "/report",
        icons: [
          {
            src: "/clearpath-app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      {
        name: "ข่าวสาร ClearPath",
        short_name: "ข่าวสาร",
        url: "/community",
        icons: [
          {
            src: "/clearpath-app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
    ],
  };
}
