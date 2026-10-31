"use client";

import { useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";

import MyContribution from "./community/MyContribution";
import ReviewQueue from "./community/ReviewQueue";
import Link from "next/link";

export default function ProfilePanel() {
  const auth = useAuth();
  const loginPrompt = useLoginPrompt();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const [gratitudeOpen, setGratitudeOpen] = useState(false);

  return (
    <section className="cp-profile-page cp-section-enter">
      {!signedIn && (
        <aside className="cp-auth-redirect" aria-label="ต้องเข้าสู่ระบบ">
          <span>
            <strong>เข้าสู่ระบบเพื่อดูโปรไฟล์</strong>
            <small>บัญชี Google จัดการจากหน้าการตั้งค่า</small>
          </span>
          <button
            type="button"
            className="cp-focus"
            onClick={() =>
              loginPrompt.openLoginPrompt({
                title: "เข้าสู่ระบบเพื่อดูโปรไฟล์",
                description:
                  "ดูรายงาน คำขอบคุณ และกิจกรรมของคุณด้วยบัญชี Google",
              })
            }
          >
            เข้าสู่ระบบด้วย Google
          </button>
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
        <Link
          href="/leaderboard"
          className="cp-community-disclosure cp-xp-entry cp-focus"
        >
          <AppIcon name="activity" size={22} />
          <span>
            <strong>อันดับชุมชน</strong>
            <small>XP สะสม ยศ และอันดับการมีส่วนร่วม</small>
          </span>
          <AppIcon name="chevron" size={18} />
        </Link>
      )}
    </section>
  );
}
