import type { Metadata } from "next";

import TermsOfServicePage from "@/frontend/components/TermsOfServicePage";

export const metadata: Metadata = {
  title: "ข้อกำหนดการใช้งาน — ClearPath",
  description:
    "ข้อกำหนดสำหรับข้อมูลคุณภาพอากาศ พยากรณ์ PM2.5 และการส่งรายงานจากชุมชนบน ClearPath",
};

export default function TermsPage() {
  return <TermsOfServicePage />;
}
