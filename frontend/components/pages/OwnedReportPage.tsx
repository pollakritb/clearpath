"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import UserPageShell from "@/frontend/components/app/UserPageShell";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { useLoginPrompt } from "@/frontend/components/auth/LoginPromptProvider";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api } from "@/frontend/lib/api-client";
import styles from "./OwnedReportPage.module.css";

const STATUS = {
  pending: "กำลังประมวลผล",
  approved: "เผยแพร่แล้ว",
  rejected: "ไม่ผ่าน",
};
export default function OwnedReportPage({ reportId }: { reportId: string }) {
  const auth = useAuth();
  const { openLoginPrompt } = useLoginPrompt();
  const owner = auth.user?.id ?? (auth.localDemo ? "local" : null);
  const loader = useCallback(() => api.myReportDetail(reportId), [reportId]);
  const query = useAccountData(owner, `my-report:${reportId}`, loader);
  const report = query.data;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const formatDate = (value: string) =>
    new Date(value).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <UserPageShell
      tab="settings"
      icon="report"
      header={{
        title: "รายละเอียดรายงานของฉัน",
        description: "",
        showDataStatus: false,
        settingsCloseHref: "/profile?tab=reports",
        settingsCloseFallback: "/profile?tab=reports",
      }}
    >
      <article className={styles.detail}>
        <Link href="/profile?tab=reports">← กลับรายงานของฉัน</Link>
        {!owner && auth.loading ? (
          <p role="status">กำลังตรวจสอบบัญชี…</p>
        ) : !owner ? (
          <button onClick={() => openLoginPrompt()}>
            เข้าสู่ระบบเพื่อดูรายงาน
          </button>
        ) : query.error ? (
          <div role="alert">
            <p>
              เปิดรายงานไม่สำเร็จ
              รายงานอาจไม่อยู่ในบัญชีนี้หรือไม่สามารถเชื่อมต่อได้
            </p>
            <button onClick={() => query.refresh()}>ลองใหม่</button>
          </div>
        ) : !report ? (
          <p role="status">กำลังโหลดรายละเอียดรายงาน…</p>
        ) : (
          <>
            <header>
              <span>{STATUS[report.status]}</span>
              <h2>รายงาน {report.id}</h2>
            </header>
            <strong className={styles.value}>
              {report.verified_pm25 ?? report.ocr_pm25 ?? "—"}{" "}
              <small>µg/m³</small>
            </strong>
            <dl>
              <dt>เวลาวัด</dt>
              <dd>{formatDate(report.captured_at)}</dd>
              <dt>เวลาส่ง</dt>
              <dd>{formatDate(report.created_at)}</dd>
              <dt>พื้นที่</dt>
              <dd>
                {[report.subdistrict, report.district, report.province]
                  .filter(Boolean)
                  .join(" · ") || "ไม่มีชื่อพื้นที่"}
              </dd>
            </dl>
            {!report.is_fresh && (
              <p>รายงานย้อนหลัง ไม่อยู่ในชั้นข้อมูลล่าสุดบนแผนที่</p>
            )}
            {report.status === "rejected" && (
              <>
                <p>
                  รายงานไม่ผ่าน:{" "}
                  {report.rejection_reason_code === "duplicate"
                    ? "หลักฐานซ้ำ"
                    : report.rejection_reason_code === "invalid_location"
                      ? "ข้อมูลตำแหน่งไม่ผ่านเงื่อนไข"
                      : "หลักฐานไม่ผ่านเงื่อนไขการเผยแพร่ กรุณาถ่ายภาพใหม่ให้เห็นตัวเลข PM2.5 ชัดเจน"}
                </p>
                <Link href="/report">ถ่ายภาพใหม่และส่งอีกครั้ง</Link>
              </>
            )}
            {report.image_url && failedImage !== report.image_url ? (
              <Image
                unoptimized
                src={report.image_url}
                alt="ภาพเครื่องวัดที่ส่งในรายงานนี้"
                width={800}
                height={600}
                className={styles.image}
                onError={() => setFailedImage(report.image_url)}
              />
            ) : (
              <p>
                {report.image_url
                  ? "เปิดภาพไม่สำเร็จ ลองโหลดภาพใหม่"
                  : "ไม่มีภาพให้เปิดดู หรือภาพพ้นระยะจัดเก็บแล้ว"}
              </p>
            )}
            {report.image_url && (
              <button
                onClick={() => {
                  setFailedImage(null);
                  query.refresh();
                }}
              >
                โหลดภาพใหม่
              </button>
            )}
          </>
        )}
      </article>
    </UserPageShell>
  );
}
