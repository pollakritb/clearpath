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
import ReviewQueue from "./community/ReviewQueue";
import RewardsSection from "./community/RewardsSection";

interface CommunityPanelProps {
  announcements: Announcement[];
  activities: Activity[];
  leaders: UserReputation[];
  onRefresh: () => void;
  showAdmin: boolean;
}

type ExtraPanel = "issue" | "rewards" | "sources" | null;

export default function CommunityPanel({
  announcements,
  activities,
  leaders,
  onRefresh,
  showAdmin,
}: CommunityPanelProps) {
  const [extraPanel, setExtraPanel] = useState<ExtraPanel>(null);

  return (
    <section className="cp-community-feed">
      <div className="cp-community-overview cp-section-enter">
        <AnnouncementsSection announcements={announcements} />

        <div className="cp-community-primary-actions" aria-label="งานหลัก">
          <Link
            href="/settings/notifications"
            className="cp-community-primary-action cp-focus"
          >
            <span aria-hidden="true">
              <AppIcon name="alert" size={21} />
            </span>
            <span>
              <strong>การแจ้งเตือน</strong>
              <small>ตั้งค่าฝุ่นและพื้นที่</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </Link>
          <Link href="/report" className="cp-community-primary-action cp-focus">
            <span aria-hidden="true">
              <AppIcon name="camera" size={21} />
            </span>
            <span>
              <strong>ส่งข้อมูลค่าฝุ่น</strong>
              <small>ถ่ายภาพเครื่องวัด</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </Link>
        </div>

        <div className="cp-community-account" aria-label="บัญชีผู้ร่วมรายงาน">
          <AuthControl compact />
        </div>

        <div className="cp-community-card cp-community-inbox-card">
          <NotificationInbox />
        </div>

        <details className="cp-community-disclosure">
          <summary>
            <span className="cp-community-disclosure__icon">
              <AppIcon name="activity" size={20} />
            </span>
            <span>
              <strong>ผลงานของฉัน</strong>
              <small>ดูสถานะรายงานและคะแนนความน่าเชื่อถือ</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          <div className="cp-community-disclosure__body">
            <MyContribution />
          </div>
        </details>

        <details className="cp-community-disclosure">
          <summary>
            <span className="cp-community-disclosure__icon">
              <AppIcon name="community" size={20} />
            </span>
            <span>
              <strong>ขอบคุณข้อมูลใกล้คุณ</strong>
              <small>ใช้ GPS เพื่อขอบคุณผู้แบ่งปันข้อมูล</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          <div className="cp-community-disclosure__body">
            <ReviewQueue onRefresh={onRefresh} />
          </div>
        </details>

        <details className="cp-community-disclosure cp-community-more">
          <summary>
            <span className="cp-community-disclosure__icon">
              <AppIcon name="menu" size={20} />
            </span>
            <span>
              <strong>เพิ่มเติม</strong>
              <small>แจ้งปัญหา กิจกรรม และข้อมูลเกี่ยวกับชุมชน</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          <div className="cp-community-disclosure__body">
            <div className="cp-community-more__menu" aria-label="เมนูเพิ่มเติม">
              <button
                type="button"
                className="cp-focus"
                data-active={extraPanel === "issue"}
                onClick={() =>
                  setExtraPanel((current) =>
                    current === "issue" ? null : "issue",
                  )
                }
              >
                <AppIcon name="alert" size={18} />
                <span>
                  <strong>แจ้งข้อมูลผิดพลาด</strong>
                  <small>บอกสถานีหรือพื้นที่ให้ผู้ดูแลตรวจ</small>
                </span>
              </button>
              <button
                type="button"
                className="cp-focus"
                data-active={extraPanel === "rewards"}
                onClick={() =>
                  setExtraPanel((current) =>
                    current === "rewards" ? null : "rewards",
                  )
                }
              >
                <AppIcon name="community" size={18} />
                <span>
                  <strong>กิจกรรมและอันดับ</strong>
                  <small>ดูภารกิจและผู้ช่วยชุมชน</small>
                </span>
              </button>
              <button
                type="button"
                className="cp-focus"
                data-active={extraPanel === "sources"}
                onClick={() =>
                  setExtraPanel((current) =>
                    current === "sources" ? null : "sources",
                  )
                }
              >
                <AppIcon name="info" size={18} />
                <span>
                  <strong>แหล่งข้อมูลชุมชน</strong>
                  <small>ความต่างของเซนเซอร์และบุคคล</small>
                </span>
              </button>
            </div>

            {extraPanel === "issue" && (
              <div className="cp-community-more__content cp-section-enter">
                <DataIssueForm />
              </div>
            )}
            {extraPanel === "rewards" && (
              <div className="cp-community-more__content cp-section-enter">
                <RewardsSection activities={activities} leaders={leaders} />
              </div>
            )}
            {extraPanel === "sources" && (
              <div className="cp-community-more__content cp-community-source-key cp-section-enter">
                <div>
                  <SourceBadge kind="sensor" />
                  <small>อุปกรณ์ประจำจุดที่ลงทะเบียนและสอบเทียบ</small>
                </div>
                <div>
                  <SourceBadge kind="individual" />
                  <small>สมาชิกถ่ายภาพสดพร้อมตำแหน่ง GPS</small>
                </div>
              </div>
            )}

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
        </details>
      </div>
    </section>
  );
}
