"use client";

import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api } from "@/frontend/lib/api-client";
import type { CommunityProfileResponse } from "@/frontend/types";

const STATUS_LABEL = {
  pending: "กำลังประมวลผล",
  approved: "เผยแพร่แล้ว",
  rejected: "ไม่ผ่าน",
};

export default function MyContribution({
  active = true,
}: {
  active?: boolean;
}) {
  const auth = useAuth();
  const ownerId = auth.user?.id ?? (auth.localDemo ? "local" : null);
  const query = useAccountData<CommunityProfileResponse>(
    ownerId,
    "my-reports",
    api.myProfile,
    active,
  );
  const profile = query.data;
  const error = query.error;
  const [visible, setVisible] = useState(5);

  if (error && !profile)
    return (
      <div className="cp-participation-empty">
        <p role="alert">โหลดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง</p>
        <button
          type="button"
          className="cp-focus"
          onClick={() => query.refresh()}
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
      {error && (
        <p role="alert">
          เชื่อมต่อไม่ได้ กำลังแสดงรายงานที่โหลดไว้{" "}
          <button type="button" onClick={() => query.refresh()}>
            ลองใหม่
          </button>
        </p>
      )}
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
                <div>
                  <p>
                    รายงานนี้ไม่เผยแพร่:{" "}
                    {
                      (
                        {
                          image_unclear: "ภาพไม่ชัดพอให้อ่านตัวเลข",
                          value_mismatch: "ค่าที่อ่านได้ไม่ตรงกับข้อมูลรายงาน",
                          suspected_screen_recapture:
                            "หลักฐานภาพไม่ผ่านเงื่อนไข",
                          invalid_location: "ข้อมูลตำแหน่งไม่ผ่านเงื่อนไข",
                          invalid_measurement: "ข้อมูลการวัดไม่ผ่านเงื่อนไข",
                          duplicate: "หลักฐานซ้ำ",
                          other: "หลักฐานไม่ผ่านเงื่อนไขการเผยแพร่",
                        } as Record<string, string>
                      )[report.rejection_reason_code ?? "other"]
                    }
                  </p>
                  <Link href="/report" className="cp-focus">
                    ถ่ายภาพใหม่และส่งอีกครั้ง
                  </Link>
                </div>
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
