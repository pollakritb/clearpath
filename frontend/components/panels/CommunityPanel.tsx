"use client";

import { useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type { Announcement } from "@/frontend/types";

import AnnouncementsSection from "./community/AnnouncementsSection";
import MyContribution from "./community/MyContribution";
import NotificationInbox from "./community/NotificationInbox";

interface CommunityPanelProps {
  announcements: Announcement[];
}

export default function CommunityPanel({ announcements }: CommunityPanelProps) {
  const auth = useAuth();
  const [reportsOpen, setReportsOpen] = useState(false);

  return (
    <section className="cp-community-feed">
      <div className="cp-community-overview cp-section-enter">
        <AnnouncementsSection announcements={announcements} />

        <div className="cp-community-account" aria-label="บัญชีของฉัน">
          <AuthControl compact />
        </div>

        {(auth.user || auth.localDemo) && (
          <section
            className="cp-community-card cp-community-inbox-card"
            aria-label="การแจ้งเตือนของฉัน"
          >
            <NotificationInbox />
          </section>
        )}

        <details
          className="cp-community-disclosure"
          onToggle={(event) => setReportsOpen(event.currentTarget.open)}
        >
          <summary className="cp-focus">
            <span className="cp-community-disclosure__icon">
              <AppIcon name="activity" size={20} />
            </span>
            <span>
              <strong>รายงานของฉัน</strong>
              <small>ดูสถานะรายงานและคะแนนความน่าเชื่อถือ</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          {reportsOpen && (
            <div className="cp-community-disclosure__body">
              <MyContribution />
            </div>
          )}
        </details>
      </div>
    </section>
  );
}
