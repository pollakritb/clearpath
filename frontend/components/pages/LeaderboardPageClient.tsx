"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import XPDashboard from "@/frontend/components/community/XPDashboard";
export default function LeaderboardPageClient() {
  const router = useRouter();
  const auth = useAuth();
  const login = useLoginPrompt();
  const signedIn = Boolean(auth.user || auth.localDemo);
  return (
    <UserPageShell
      tab="settings"
      icon="activity"
      header={{
        title: "อันดับชุมชน",
        description: "คะแนนและยศการมีส่วนร่วมตลอดชีพ",
        showDataStatus: false,
      }}
    >
      <div className="cp-xp cp-xp-page">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/profile")
          }
        >
          ← กลับ
        </button>
        {!signedIn && !auth.loading && (
          <button
            type="button"
            onClick={() =>
              login.openLoginPrompt({
                title: "เข้าสู่ระบบเพื่อดูคะแนนของคุณ",
                description:
                  "ใช้บัญชี Google เพื่อจัดการนามแฝงและการแสดงอันดับ",
              })
            }
          >
            เข้าสู่ระบบเพื่อดูคะแนนของฉัน
          </button>
        )}
        <XPDashboard
          key={auth.user?.id ?? (auth.localDemo ? "local" : "guest")}
          signedIn={signedIn}
        />
      </div>
    </UserPageShell>
  );
}
