"use client";

import Link from "next/link";
import { useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import type { Activity, Announcement, UserReputation } from "@/frontend/types";

import AnnouncementsSection from "./community/AnnouncementsSection";
import DataIssueForm from "./community/DataIssueForm";
import MyContribution from "./community/MyContribution";
import NotificationInbox from "./community/NotificationInbox";
import NotificationSettings from "./community/NotificationSettings";
import ReviewQueue from "./community/ReviewQueue";
import RewardsSection from "./community/RewardsSection";

interface CommunityPanelProps {
  announcements: Announcement[];
  activities: Activity[];
  leaders: UserReputation[];
  onRefresh: () => void;
  showAdmin: boolean;
}

export default function CommunityPanel({
  announcements,
  activities,
  leaders,
  onRefresh,
  showAdmin,
}: CommunityPanelProps) {
  const [section, setSection] = useState<"overview" | "notifications">(
    "overview",
  );

  return (
    <section className="cp-community-feed">
      <header className="cp-community-welcome">
        <span className="cp-community-welcome__icon">
          <AppIcon name="sparkles" size={24} />
        </span>
        <div>
          <span>ชุมชน ClearPath</span>
          <h2>ข้อมูลของคุณช่วยทุกคนได้</h2>
          <p>ติดตามรายงาน คำขอบคุณ และข่าวสำคัญในพื้นที่</p>
        </div>
      </header>

      <nav className="cp-community-tabs" aria-label="ส่วนของหน้าชุมชน">
        <button
          type="button"
          className="cp-focus"
          data-active={section === "overview"}
          aria-current={section === "overview" ? "page" : undefined}
          onClick={() => setSection("overview")}
        >
          <AppIcon name="community" size={18} /> ภาพรวม
        </button>
        <button
          type="button"
          className="cp-focus"
          data-active={section === "notifications"}
          aria-current={section === "notifications" ? "page" : undefined}
          onClick={() => setSection("notifications")}
        >
          <AppIcon name="alert" size={18} /> การแจ้งเตือน
        </button>
      </nav>

      {section === "notifications" ? (
        <div className="cp-community-notification-page cp-section-enter">
          <div className="cp-community-section-heading">
            <span className="cp-community-disclosure__icon">
              <AppIcon name="alert" size={20} />
            </span>
            <span>
              <h3>ตั้งค่าการแจ้งเตือน</h3>
              <p>เลือกช่องทาง ระดับฝุ่น และพื้นที่ที่ต้องการรับข่าว</p>
            </span>
          </div>
          <NotificationSettings />
        </div>
      ) : (
        <div className="cp-community-overview cp-section-enter">
          <div className="cp-community-account" aria-label="บัญชีผู้ร่วมรายงาน">
            <AuthControl compact />
          </div>

          {announcements.length > 0 && (
            <div className="cp-community-card">
              <AnnouncementsSection announcements={announcements} />
            </div>
          )}
          <div className="cp-community-card">
            <NotificationInbox />
            <MyContribution />
          </div>
          <div className="cp-community-card cp-community-card--thanks">
            <ReviewQueue onRefresh={onRefresh} />
          </div>

          <details className="cp-community-disclosure">
            <summary>
              <span className="cp-community-disclosure__icon">
                <AppIcon name="alert" size={20} />
              </span>
              <span>
                <strong>แจ้งข้อมูลผิดพลาด</strong>
                <small>บอกสถานีหรือพื้นที่ให้ผู้ดูแลตรวจ</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </summary>
            <div className="cp-community-disclosure__body">
              <DataIssueForm />
            </div>
          </details>

          <details className="cp-community-disclosure">
            <summary>
              <span className="cp-community-disclosure__icon">
                <AppIcon name="community" size={20} />
              </span>
              <span>
                <strong>กิจกรรมและอันดับ</strong>
                <small>ดูภารกิจ คะแนน และผู้ช่วยชุมชน</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </summary>
            <div className="cp-community-disclosure__body">
              <RewardsSection activities={activities} leaders={leaders} />
            </div>
          </details>

          <details className="cp-community-disclosure cp-community-source-help">
            <summary>
              <span className="cp-community-disclosure__icon">
                <AppIcon name="info" size={20} />
              </span>
              <span>
                <strong>แหล่งข้อมูลชุมชนต่างกันอย่างไร</strong>
                <small>สถานีชุมชนและรายงานจากบุคคล</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </summary>
            <div className="cp-community-disclosure__body cp-community-source-key">
              <div>
                <SourceBadge kind="sensor" />
                <small>อุปกรณ์ประจำจุดที่ลงทะเบียน</small>
              </div>
              <div>
                <SourceBadge kind="individual" />
                <small>สมาชิกถ่ายภาพสดพร้อม GPS</small>
              </div>
            </div>
          </details>

          {showAdmin && (
            <Link href="/admin" className="cp-community-admin-link cp-focus">
              <AppIcon name="admin" size={21} />
              <span>
                <strong>ศูนย์ควบคุมผู้ดูแล</strong>
                <small>ตรวจข้อยกเว้นและดูสถานะระบบ</small>
              </span>
              <AppIcon name="chevron" size={18} />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
