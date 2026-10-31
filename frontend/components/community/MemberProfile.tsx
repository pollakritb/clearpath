"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { PublicMember } from "@/frontend/types/xp";
import ParticipationBadge from "./ParticipationBadge";
export default function MemberProfile({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [member, setMember] = useState<PublicMember | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api
      .publicMember(memberId)
      .then((r) => {
        if (active) setMember(r);
      })
      .catch((e) => {
        if (active) setError(apiErrorMessage(e, "โหลดสมาชิกไม่สำเร็จ"));
      });
    return () => {
      active = false;
    };
  }, [memberId]);
  return (
    <UserPageShell
      tab="settings"
      icon="user"
      header={{ title: "สมาชิกชุมชน", showDataStatus: false }}
    >
      <section className="cp-xp">
        <button type="button" onClick={() => router.back()}>
          ← กลับ
        </button>
        {member ? (
          <div className="cp-xp-profile">
            <h2>{member.alias}</h2>
            <ParticipationBadge rank={member.rank} />
            <p className="cp-xp-total">
              {member.lifetime_xp} <small>XP</small>
            </p>
            <p>มีผลงาน {member.contribution_days} วัน</p>
            <div className="cp-xp-chips">
              {member.achievements.map((a) => (
                <span key={a}>✦ {a}</span>
              ))}
            </div>
            <p className="cp-xp-note">
              ยศแสดงการมีส่วนร่วม ไม่ใช่การรับรองความแม่นยำของเครื่องวัด
            </p>
          </div>
        ) : (
          <p role={error ? "alert" : "status"}>{error || "กำลังโหลดสมาชิก…"}</p>
        )}
      </section>
    </UserPageShell>
  );
}
