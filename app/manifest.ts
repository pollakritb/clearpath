import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClearPath Community",
    short_name: "ClearPath",
    description: "พยากรณ์ PM2.5 และเครือข่ายข้อมูลคุณภาพอากาศชุมชน",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f6",
    theme_color: "#0e7c79",
    lang: "th",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "อากาศวันนี้",
        short_name: "วันนี้",
        url: "/air",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "ส่งข้อมูล PM2.5",
        short_name: "ส่งข้อมูล",
        url: "/report",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "ชุมชน ClearPath",
        short_name: "ชุมชน",
        url: "/community",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
