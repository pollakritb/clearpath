"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") ?? tab;
  const selected = SECTIONS.some(([value]) => value === requested)
    ? requested
    : "overview";
  const [visited, setVisited] = useState(() => new Set([selected]));
  const owner = auth.user?.id ?? (auth.localDemo ? "local" : "guest");

  return (
    <section className="cp-participation-page cp-section-enter">
      <nav className="cp-participation-nav" aria-label="ผลงานและอันดับ">
        {SECTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setVisited((previous) => new Set([...previous, value]));
              window.history.replaceState(null, "", `/profile?tab=${value}`);
            }}
            aria-pressed={selected === value}
            className="cp-focus"
          >
            {label}
          </button>
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
      ) : (
        <>
          {SECTIONS.map(
            ([value]) =>
              (visited.has(value) || selected === value) && (
                <div
                  key={`${owner}-${value}`}
                  hidden={selected !== value}
                  inert={selected !== value}
                >
                  {value === "reports" ? (
                    <MyContribution active={selected === value} />
                  ) : (
                    <XPDashboard
                      signedIn={signedIn}
                      active={selected === value}
                      section={
                        value === "leaderboard" ? "leaderboard" : "overview"
                      }
                    />
                  )}
                </div>
              ),
          )}
        </>
      )}
    </section>
  );
}
