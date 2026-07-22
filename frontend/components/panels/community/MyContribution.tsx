"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api } from "@/frontend/lib/api-client";
import { T } from "@/frontend/lib/ui";
import type { CommunityProfileResponse } from "@/frontend/types";

const STATUS_LABEL = {
  pending: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่ผ่าน",
};

export default function MyContribution() {
  const auth = useAuth();
  const [profile, setProfile] = useState<CommunityProfileResponse | null>(null);

  useEffect(() => {
    if (!auth.user && !auth.localDemo) return;
    let cancelled = false;
    void api
      .myProfile()
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [auth.user, auth.localDemo]);

  if (!profile) return null;
  return (
    <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
      <h2 style={{ margin: "0 0 .5em", fontSize: ".95em" }}>ผลงานของฉัน</h2>
      <div className="cp-profile-stats">
        <div
          style={{ background: T.chip, borderRadius: "9px", padding: ".6em" }}
        >
          <small>Trust / คะแนนรวม</small>
          <strong style={{ display: "block", fontFamily: T.mono }}>
            {profile.reputation_score}
          </strong>
        </div>
        <div
          style={{ background: T.chip, borderRadius: "9px", padding: ".6em" }}
        >
          <small>รายงานผ่าน</small>
          <strong style={{ display: "block", fontFamily: T.mono }}>
            {profile.approved_reports}
          </strong>
        </div>
        <div
          style={{ background: T.chip, borderRadius: "9px", padding: ".6em" }}
        >
          <small>ช่วยตรวจ</small>
          <strong style={{ display: "block", fontFamily: T.mono }}>
            {profile.helpful_reviews}
          </strong>
        </div>
      </div>
      {profile.badges.length > 0 && (
        <p style={{ fontSize: ".72em", color: T.teal }}>
          Badge: {profile.badges.join(" · ")}
        </p>
      )}
      {profile.reports.slice(0, 5).map((report) => (
        <div
          key={report.id}
          style={{
            borderBottom: `1px solid ${T.line}`,
            padding: ".5em 0",
            fontSize: ".72em",
          }}
        >
          <div className="cp-contribution-row">
            <strong>{STATUS_LABEL[report.status]}</strong>
            <span>{new Date(report.created_at).toLocaleString("th-TH")}</span>
          </div>
          <div style={{ color: T.subInk }}>
            ผู้ใช้ยืนยัน {report.user_claimed_pm25 ?? "—"} · Admin{" "}
            {report.admin_verified_pm25 ?? "—"} µg/m³
            {report.rejection_reason_code
              ? ` · เหตุผล: ${report.rejection_reason_code}`
              : ""}
          </div>
        </div>
      ))}
    </section>
  );
}
