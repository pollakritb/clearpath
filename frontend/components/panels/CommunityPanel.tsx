import type { Activity, Announcement, UserReputation } from "@/frontend/types";
import Link from "next/link";

import AnnouncementsSection from "./community/AnnouncementsSection";
import ReviewQueue from "./community/ReviewQueue";
import RewardsSection from "./community/RewardsSection";
import NotificationSettings from "./community/NotificationSettings";
import NotificationInbox from "./community/NotificationInbox";
import MyContribution from "./community/MyContribution";
import DataIssueForm from "./community/DataIssueForm";
import AppIcon from "@/frontend/components/ui/AppIcon";
import SourceBadge from "@/frontend/components/ui/SourceBadge";
import AuthControl from "@/frontend/components/auth/AuthControl";

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
  return (
    <section className="cp-community-feed">
      <header className="cp-community-welcome">
        <span className="cp-community-welcome__icon">
          <AppIcon name="sparkles" size={24} />
        </span>
        <div>
          <span>ชุมชน ClearPath</span>
          <h2>ช่วยกันทำให้ข้อมูลอากาศดีขึ้น</h2>
          <p>ดูข่าว ส่งคำขอบคุณ และติดตามสิ่งที่คุณช่วยชุมชนไว้</p>
        </div>
      </header>

      <div
        className="cp-community-source-key"
        aria-label="ประเภทผู้ให้ข้อมูลชุมชน"
      >
        <div>
          <SourceBadge kind="sensor" />
          <small>อุปกรณ์ประจำจุดที่ลงทะเบียน</small>
        </div>
        <div>
          <SourceBadge kind="individual" />
          <small>สมาชิกถ่ายภาพสดพร้อม GPS</small>
        </div>
      </div>

      <div className="cp-community-account" aria-label="บัญชีผู้ร่วมรายงาน">
        <AuthControl />
      </div>

      <div className="cp-community-card">
        <AnnouncementsSection announcements={announcements} />
      </div>
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
            <AppIcon name="settings" size={20} />
          </span>
          <span>
            <strong>การแจ้งเตือน</strong>
            <small>เลือกเรื่องที่ต้องการให้แจ้ง</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </summary>
        <div className="cp-community-disclosure__body">
          <NotificationSettings />
        </div>
      </details>

      <details className="cp-community-disclosure">
        <summary>
          <span className="cp-community-disclosure__icon">
            <AppIcon name="alert" size={20} />
          </span>
          <span>
            <strong>แจ้งข้อมูลผิดพลาด</strong>
            <small>
              ส่งชื่อสถานีหรือพื้นที่ให้ผู้ดูแลตรวจ โดยไม่แนบข้อมูลส่วนตัว
            </small>
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
    </section>
  );
}
