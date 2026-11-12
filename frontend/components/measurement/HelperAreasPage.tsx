"use client";
import Link from "next/link";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import AppIcon from "@/frontend/components/ui/AppIcon";
import HelperSettings from "./HelperSettings";

export default function HelperAreasPage({ requestId }: { requestId?: string }) {
  const returnHref = requestId
    ? `/requests/${encodeURIComponent(requestId)}`
    : "/settings/notifications";
  return (
    <UserPageShell
      tab="settings"
      icon="settings"
      header={{
        showDataStatus: false,
        title: "พื้นที่รับคำขอ",
        description: "บ้าน ที่ทำงาน และจุดที่พร้อมช่วยวัด",
        settingsCloseHref: returnHref,
      }}
    >
      <section className="cp-settings-page cp-helper-areas-page">
        <Link href={returnHref} className="cp-settings-back cp-focus">
          <AppIcon name="back" size={18} />
          {requestId ? "กลับไปคำขอของฉัน" : "กลับไปการแจ้งเตือน"}
        </Link>
        <h1>ช่วยวัดให้คนใกล้คุณ</h1>
        <p>รับคำขอจากคนใกล้บ้านหรือที่ทำงาน เมื่อคุณพร้อมช่วยวัด</p>
        <HelperSettings />
      </section>
    </UserPageShell>
  );
}
