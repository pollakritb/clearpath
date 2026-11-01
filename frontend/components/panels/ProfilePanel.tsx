"use client";

import Link from "next/link";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import XPDashboard from "@/frontend/components/community/XPDashboard";
import MyContribution from "./community/MyContribution";

const SECTIONS = [
  ["overview", "ภาพรวม"],
  ["reports", "รายงานของฉัน"],
  ["leaderboard", "อันดับชุมชน"],
] as const;

export default function ProfilePanel({ tab = "overview" }: { tab?: string }) {
  const auth = useAuth();
  const loginPrompt = useLoginPrompt();
  const signedIn = Boolean(auth.user || auth.localDemo);
  const selected = SECTIONS.some(([value]) => value === tab) ? tab : "overview";

  return (
    <section className="cp-participation-page cp-section-enter">
      <nav className="cp-participation-nav" aria-label="ผลงานและอันดับ">
        {SECTIONS.map(([value, label]) => (
          <Link
            key={value}
            href={`/profile?tab=${value}`}
            aria-current={selected === value ? "page" : undefined}
            className="cp-focus"
            scroll={false}
            replace
          >
            {label}
          </Link>
        ))}
      </nav>
      {auth.loading ? (
        <p role="status" className="cp-xp-note">
          กำลังโหลดบัญชี…
        </p>
      ) : !signedIn && selected !== "leaderboard" ? (
        <section className="cp-participation-empty">
          <h2>ผลงานของคุณเริ่มที่รายงานแรก</h2>
          <p>เข้าสู่ระบบเพื่อดูคะแนน ยศ และรายงานที่คุณส่ง</p>
          <button
            type="button"
            className="cp-focus"
            onClick={() =>
              loginPrompt.openLoginPrompt({
                title: "เข้าสู่ระบบเพื่อดูผลงาน",
                description: "ดูคะแนนสะสมและติดตามรายงานของคุณด้วยบัญชี Google",
              })
            }
          >
            เข้าสู่ระบบด้วย Google
          </button>
        </section>
      ) : selected === "reports" ? (
        <MyContribution key={auth.user?.id ?? "local"} />
      ) : (
        <XPDashboard
          key={`${auth.user?.id ?? (auth.localDemo ? "local" : "guest")}-${selected}`}
          signedIn={signedIn}
          section={selected === "leaderboard" ? "leaderboard" : "overview"}
        />
      )}
    </section>
  );
}
