"use client";
import CommunityTrustCard from "@/frontend/components/community/CommunityTrustCard";
import { useEffect, useState } from "react";
import ReturnToLink from "@/frontend/components/app/ReturnToLink";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { PublicMember } from "@/frontend/types/xp";
import ParticipationBadge from "./ParticipationBadge";
export default function MemberProfile({ memberId }: { memberId: string }) {
  const [loaded, setLoaded] = useState<{
    id: string;
    member: PublicMember;
  } | null>(null);
  const [failure, setFailure] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [attempt, retry] = useState(0);
  const member = loaded?.id === memberId ? loaded.member : null;
  const error = failure?.id === memberId ? failure.message : "";
  useEffect(() => {
    let active = true;
    void api
      .publicMember(memberId)
      .then((r) => {
        if (active) setLoaded({ id: memberId, member: r });
      })
      .catch((e) => {
        if (active)
          setFailure({
            id: memberId,
            message: apiErrorMessage(e, "โหลดสมาชิกไม่สำเร็จ"),
          });
      });
    return () => {
      active = false;
    };
  }, [memberId, attempt]);
  return (
    <UserPageShell
      tab="settings"
      icon="user"
      header={{
        title: "สมาชิกชุมชน",
        description: "ผลงานและเสียงประเมินการรายงานจากชุมชน",
        showDataStatus: false,
        settingsCloseFallback: "/profile?tab=leaderboard",
      }}
    >
      <section className="cp-xp">
        <ReturnToLink fallback="/profile?tab=leaderboard" className="cp-focus">
          ← กลับ
        </ReturnToLink>
        {member ? (
          <div className="cp-xp-profile">
            <h2>{member.alias}</h2>
            <ParticipationBadge rank={member.rank} />
            <p className="cp-xp-total">
              {member.lifetime_xp} <small>คะแนน</small>
            </p>
            <p>มีผลงาน {member.contribution_days} วัน</p>
            <CommunityTrustCard trust={member.community_trust} />
            {member.evidence_history && (
              <section
                className="cp-evidence-panel"
                aria-label="ประวัติหลักฐานสมาชิก"
              >
                <h3>ผลตรวจหลักฐานอิสระ</h3>
                {member.evidence_history.evaluated ? (
                  <>
                    <p>
                      ผ่าน {member.evidence_history.passed} · พบปัญหา{" "}
                      {member.evidence_history.problems} · ยังสรุปไม่ได้{" "}
                      {member.evidence_history.unresolved}
                    </p>
                    <p>
                      อัตราผ่าน {member.evidence_history.pass_rate}% จาก{" "}
                      {member.evidence_history.evaluated} รายการที่สรุปได้
                    </p>
                  </>
                ) : (
                  <p>ยังมีประวัติไม่เพียงพอ</p>
                )}
                <small>
                  ผลตรวจตามขอบเขตที่ประเมิน ไม่ใช่การรับรองความแม่นยำของเครื่อง
                </small>
              </section>
            )}
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
          <div>
            <p role={error ? "alert" : "status"}>
              {error || "กำลังโหลดสมาชิก…"}
            </p>
            {error && (
              <button
                type="button"
                className="cp-focus"
                onClick={() => {
                  setFailure(null);
                  retry((value) => value + 1);
                }}
              >
                ลองโหลดสมาชิกอีกครั้ง
              </button>
            )}
          </div>
        )}
      </section>
    </UserPageShell>
  );
}
