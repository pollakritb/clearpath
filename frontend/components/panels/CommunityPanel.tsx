"use client";

import { useState } from "react";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type { Announcement } from "@/frontend/types";
import AnnouncementsSection from "./community/AnnouncementsSection";
import NotificationInbox from "./community/NotificationInbox";

export default function CommunityPanel({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const auth = useAuth();
  const [section, setSection] = useState<"news" | "notifications">("news");
  return (
    <section className="cp-community-feed cp-news-mobile">
      <div className="cp-news-tabs" role="group" aria-label="หมวดข่าวสาร">
        <button
          type="button"
          className="cp-focus"
          aria-pressed={section === "news"}
          onClick={() => setSection("news")}
        >
          <AppIcon name="megaphone" size={17} />
          ข่าวล่าสุด
        </button>
        <button
          type="button"
          className="cp-focus"
          aria-pressed={section === "notifications"}
          onClick={() => setSection("notifications")}
        >
          <AppIcon name="alert" size={17} />
          การแจ้งเตือน
        </button>
      </div>
      <div hidden={section !== "news"}>
        <AnnouncementsSection announcements={announcements} />
      </div>
      {section === "notifications" && (
        <section className="cp-news-inbox" aria-label="การแจ้งเตือนของฉัน">
          {auth.user || auth.localDemo ? (
            <NotificationInbox />
          ) : (
            <p className="cp-news-empty">
              เข้าสู่ระบบจากปุ่มโปรไฟล์เพื่อดูการแจ้งเตือนของคุณ
            </p>
          )}
        </section>
      )}
    </section>
  );
}
