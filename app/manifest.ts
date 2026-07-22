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
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
