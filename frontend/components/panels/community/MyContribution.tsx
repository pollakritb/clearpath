"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { CommunityProfileResponse } from "@/frontend/types";

const STATUS_LABEL = {
  pending: "กำลังประมวลผล",
  approved: "เผยแพร่แล้ว",
  rejected: "ไม่ผ่าน",
};

export default function MyContribution() {
  const auth = useAuth();
  const ownerId = auth.user?.id ?? (auth.localDemo ? "local" : null);
  const [profile, setProfile] = useState<CommunityProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(5);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    void api
      .myProfile()
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause, "โหลดรายงานไม่สำเร็จ"));
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, attempt]);

  if (error)
    return (
      <div className="cp-participation-empty">
        <p role="alert">{error}</p>
        <button
          type="button"
          className="cp-focus"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  if (!profile)
    return (
      <p role="status" className="cp-xp-note">
        กำลังโหลดรายงานของคุณ…
      </p>
    );

  return (
    <section className="cp-contribution" aria-label="รายงานของฉัน">
      <div className="cp-participation-stats">
        <div>
          <strong>{profile.reports.length}</strong>
          <span>รายการล่าสุด</span>
        </div>
        <div>
          <strong>{profile.approved_reports}</strong>
          <span>เผยแพร่แล้ว</span>
        </div>
      </div>
      <p className="cp-xp-note">ประวัติล่าสุดสูงสุด 50 รายงาน</p>
      <header className="cp-contribution-heading">
        <h2>รายงานล่าสุด</h2>
        <Link href="/report" className="cp-focus">
          <AppIcon name="report" size={17} />
          ส่งรายงาน
        </Link>
      </header>
      {profile.reports.length === 0 ? (
        <div className="cp-participation-empty">
          <AppIcon name="report" size={28} />
          <h3>ยังไม่มีรายงาน</h3>
          <p>ส่งภาพเครื่องวัดเพื่อช่วยให้ชุมชนเห็นค่าฝุ่นใกล้คุณ</p>
        </div>
      ) : (
        <ul className="cp-contribution-list">
          {profile.reports.slice(0, visible).map((report) => (
            <li key={report.id}>
              <div className="cp-contribution-heading">
                <span
                  className="cp-contribution-status"
                  data-status={report.status}
                >
                  {STATUS_LABEL[report.status]}
                </span>
                <time dateTime={report.created_at}>
                  {new Date(report.created_at).toLocaleString("th-TH", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <strong className="cp-contribution-value">
                {report.verified_pm25 ?? "—"} <small>µg/m³</small>
              </strong>
              {report.status === "rejected" && (
                <p>รายงานนี้ไม่ผ่านการตรวจ คุณสามารถส่งภาพใหม่ได้</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {profile.reports.length > visible && (
        <button
          type="button"
          className="cp-contribution-more cp-focus"
          onClick={() => setVisible((value) => value + 5)}
        >
          ดูรายงานเพิ่ม
        </button>
      )}
    </section>
  );
}
