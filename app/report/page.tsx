import type { Metadata } from "next";

import ClearPathApp from "@/frontend/components/app/ClearPathApp";

export const metadata: Metadata = {
  title: "ส่งข้อมูล — ClearPath",
  description: "ส่งภาพเครื่องวัด PM2.5 พร้อม GPS ให้ระบบตรวจหลักฐานอัตโนมัติ",
};

export default function ReportPage() {
  return <ClearPathApp page="report" />;
}
