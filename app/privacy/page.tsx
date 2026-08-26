import type { Metadata } from "next";

import PrivacyPolicyPage from "@/frontend/components/PrivacyPolicyPage";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว — ClearPath",
  description:
    "วิธีที่ ClearPath เก็บ ใช้ ปกป้อง และเผยแพร่ข้อมูลบัญชี Google, GPS, ภาพเครื่องวัด และรายงานชุมชน",
};

export default function PrivacyPage() {
  return <PrivacyPolicyPage />;
}
