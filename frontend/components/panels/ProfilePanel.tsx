"use client";

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { useCommunityRewards } from "@/frontend/hooks/useCommunity";

import MyContribution from "./community/MyContribution";
import ReviewQueue from "./community/ReviewQueue";
import RewardsSection from "./community/RewardsSection";

export default function ProfilePanel() {
  const auth = useAuth();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const [gratitudeOpen, setGratitudeOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);

  return (
    <section className="cp-profile-page cp-section-enter">
      {!signedIn && (
        <aside className="cp-auth-redirect" aria-label="ต้องเข้าสู่ระบบ">
          <span>
            <strong>เข้าสู่ระบบเพื่อดูโปรไฟล์</strong>
            <small>บัญชี Google จัดการจากหน้าการตั้งค่า</small>
          </span>
          <Link href="/settings" className="cp-focus">
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </aside>
      )}

      {signedIn && (
        <div className="cp-settings-card">
          <MyContribution />
        </div>
      )}

      {signedIn && (
        <details
          className="cp-community-disclosure"
          onToggle={(event) => setGratitudeOpen(event.currentTarget.open)}
        >
          <summary className="cp-focus">
            <span className="cp-community-disclosure__icon">
              <AppIcon name="community" size={20} />
            </span>
            <span>
              <strong>ขอบคุณข้อมูลใกล้คุณ</strong>
              <small>ให้ดาวแก่ข้อมูลที่ตรงกับสภาพพื้นที่</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          {gratitudeOpen && (
            <div className="cp-community-disclosure__body">
              <ReviewQueue onRefresh={() => undefined} />
            </div>
          )}
        </details>
      )}

      {signedIn && (
        <details
          className="cp-community-disclosure"
          onToggle={(event) => setRewardsOpen(event.currentTarget.open)}
        >
          <summary className="cp-focus">
            <span className="cp-community-disclosure__icon">
              <AppIcon name="activity" size={20} />
            </span>
            <span>
              <strong>กิจกรรมและอันดับ</strong>
              <small>ดูภารกิจและผู้ช่วยชุมชนในช่วง 7 วัน</small>
            </span>
            <AppIcon name="chevron" size={18} />
          </summary>
          {rewardsOpen && (
            <div className="cp-community-disclosure__body">
              <ProfileRewards />
            </div>
          )}
        </details>
      )}
    </section>
  );
}

function ProfileRewards() {
  const rewards = useCommunityRewards();
  if (rewards.loading) {
    return (
      <p className="cp-muted-status" role="status">
        กำลังโหลดกิจกรรม…
      </p>
    );
  }
  return (
    <RewardsSection activities={rewards.activities} leaders={rewards.leaders} />
  );
}
