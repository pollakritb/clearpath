import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Noto_Sans_Thai } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/frontend/components/auth/AuthProvider";
import { LoginPromptProvider } from "@/frontend/components/auth/LoginPromptProvider";
import AlertLocationPresence from "@/frontend/components/auth/AlertLocationPresence";
import HelperPresence from "@/frontend/components/measurement/HelperPresence";
import PwaRegistrar from "@/frontend/components/app/PwaRegistrar";
import NavigationEntryTracker from "@/frontend/components/app/NavigationEntryTracker";
import PersistentMapPage from "@/frontend/components/app/PersistentMapPage";

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
  title: "ClearPath — พยากรณ์ฝุ่นและเครือข่ายชุมชน",
  description:
    "ติดตามและพยากรณ์ PM2.5 จาก Air4Thai พร้อมรายงานจากชุมชนที่ผ่าน OCR และการตรวจสอบหลักฐาน",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#147BC1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoThai.variable} ${plexMono.variable}`}>
      <body>
        <div className="cp-mobile-frame">
          <div className="cp-mobile-content">
            <AuthProvider>
              <LoginPromptProvider>
                <HelperPresence />
                <AlertLocationPresence />
                <Suspense fallback={null}>
                  <NavigationEntryTracker />
                  <PersistentMapPage />
                </Suspense>
                {children}
              </LoginPromptProvider>
            </AuthProvider>
            <PwaRegistrar />
          </div>
        </div>
      </body>
    </html>
  );
}
