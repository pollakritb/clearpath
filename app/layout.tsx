import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

// UI font — variable font, all weights 400–800 available
const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
  display: "swap",
});

// numbers / data — named weights
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClearPath — วางแผนเส้นทางเลี่ยงฝุ่น PM2.5",
  description:
    "เปรียบเทียบเส้นทางและเลือกทางที่รับฝุ่น PM2.5 น้อยที่สุด ด้วยข้อมูล real-time และ IDW spatial interpolation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoThai.variable} ${plexMono.variable} h-full`}>
      <body className="h-full min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
