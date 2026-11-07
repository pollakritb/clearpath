"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ContributionMissions, XPSummary } from "@/frontend/types";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api } from "@/frontend/lib/api-client";

export default function ContributionOverview({
  summary,
  active = true,
}: {
  summary: XPSummary;
  active?: boolean;
}) {
  const load = useCallback(() => api.contributionMissions(), []);
  const tasks = useAccountData<ContributionMissions>(
    summary.member_id,
    "contribution-missions",
    load,
    active && Boolean(summary.launched_at),
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !summary.launched_at) return;
    const update = () => setNow(Date.now());
    const nextExpiry = Math.min(
      ...(tasks.data?.missions ?? [])
        .map((task) => Date.parse(task.expires_at))
        .filter((expiry) => Number.isFinite(expiry) && expiry > now),
    );
    const timer = Number.isFinite(nextExpiry)
      ? setTimeout(update, Math.max(0, nextExpiry - Date.now() + 1))
      : undefined;
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active, summary.launched_at, tasks.data, now]);
  const availableMissions =
    tasks.data?.missions.filter((task) => Date.parse(task.expires_at) > now) ??
    [];
  if (!summary.launched_at) return null;
  const history = summary.evidence_history;
  return (
    <div className="cp-contribution-overview">
      <section aria-label="การมีส่วนร่วมเดือนนี้">
        <h3>เดือนนี้ {summary.month_points ?? 0} คะแนน</h3>
        <p>
          อันดับเดือนนี้ {summary.month_rank ?? "—"}
          {summary.hidden ? " · ซ่อนจากอันดับ" : ""}
        </p>
        <p>
          สัปดาห์นี้มีผลงาน {summary.week_days ?? 0}
          {summary.policy_version === "contribution-v3" ? "/5" : ""} วัน
        </p>
        <progress
          value={Math.min(summary.week_days ?? 0, 5)}
          max={5}
          aria-label="วันที่มีผลงานในสัปดาห์"
        />
        <p>
          {(summary.week_days ?? 0) >= 5
            ? "มีผลงานครบเป้าหมาย 5 วันในสัปดาห์นี้แล้ว"
            : "ครบ 5 วันรับ +20 คะแนน · ไม่จำเป็นต้องติดต่อกัน"}
        </p>
        <p>
          ตอบคำขอที่มีบันทึก{" "}
          {summary.fulfilled_requests ?? "ยังไม่มีข้อมูลย้อนหลัง"} คำขอ ·
          ภารกิจพื้นที่ {summary.missions_completed ?? 0} ครั้ง
        </p>
        <small>
          หนึ่งรายงานอาจตอบหลายคำขอ แต่รับโบนัสบริการได้ครั้งเดียว ·
          ไม่รวมข้อมูลเก่าที่ไม่มีบันทึกผลจับคู่
        </small>
      </section>
      <section aria-label="ประวัติหลักฐาน">
        <h3>ประวัติผลตรวจอิสระ</h3>
        {!history?.evaluated ? (
          <p>ยังมีประวัติไม่เพียงพอ · การอ่าน OCR ผ่านไม่นับเป็นผลตรวจอิสระ</p>
        ) : (
          <>
            <p>
              ผ่าน {history.passed} · พบปัญหา {history.problems} · ยังสรุปไม่ได้{" "}
              {history.unresolved}
            </p>
            <p>
              อัตราผ่าน {history.pass_rate}% จากผลที่สรุปได้ {history.evaluated}{" "}
              รายการ
            </p>
            <small>
              ผลตรวจหลักฐานตามขอบเขตที่ประเมิน ไม่ใช่อัตราที่เครื่องวัดแม่นยำ
            </small>
          </>
        )}
        {history?.first_checked_at && (
          <small>
            ช่วงผลตรวจ{" "}
            {new Date(history.first_checked_at).toLocaleDateString("th-TH", {
              timeZone: "Asia/Bangkok",
            })}{" "}
            –{" "}
            {history.last_checked_at
              ? new Date(history.last_checked_at).toLocaleDateString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })
              : "ปัจจุบัน"}
          </small>
        )}
        {history && (
          <details>
            <summary>ดูแยกตามขอบเขต</summary>
            {Object.entries(history.scopes).map(([scope, item]) => (
              <p key={scope}>
                {
                  (
                    {
                      image: "ภาพและการอ่านค่า",
                      metadata: "เวลาและตำแหน่ง",
                      field_protocol: "วิธีเก็บข้อมูล",
                      instrument: "การวัดเทียบเครื่อง",
                    } as Record<string, string>
                  )[scope]
                }
                : ผ่าน {item.passed} · พบปัญหา {item.problems} · ยังสรุปไม่ได้{" "}
                {item.unresolved}
              </p>
            ))}
          </details>
        )}
      </section>
      <section aria-label="ภารกิจพื้นที่ขาดข้อมูล">
        <h3>ช่วยเติมข้อมูลพื้นที่</h3>
        <p>
          ภารกิจที่ระบบประกาศล่วงหน้า · โบนัส +5
          เมื่อเข้าเกณฑ์และยังไม่มีผู้ทำสำเร็จ · โบนัสบริการที่เหลือ{" "}
          {Math.max(0, 3 - summary.today_help)}/3 วันนี้ · วัดกลางแจ้ง
          ห่างแหล่งกำเนิด ภาพและเวลาต้องตรวจได้ GPS ไม่เกิน 200 ม. ส่งภายใน 15
          นาทีและก่อนภารกิจหมดอายุ
        </p>
        {tasks.error && (
          <div className="cp-engagement-feedback" role="alert">
            <p>
              โหลดภารกิจไม่สำเร็จ
              {availableMissions.length > 0
                ? " · แสดงรายการที่ยังไม่หมดอายุจากครั้งล่าสุด"
                : ""}
            </p>
            <button
              type="button"
              className="cp-focus"
              disabled={tasks.loading}
              onClick={() => tasks.refresh()}
            >
              ลองโหลดภารกิจใหม่
            </button>
          </div>
        )}
        {!tasks.data && tasks.loading ? (
          <p role="status">กำลังโหลดภารกิจ…</p>
        ) : tasks.data && availableMissions.length === 0 ? (
          <p>ขณะนี้ไม่มีภารกิจเปิด รายงานจุดที่คุณอยู่ได้ตามปกติ</p>
        ) : (
          <ul>
            {availableMissions.map((task) => (
              <li key={task.id}>
                <strong>{task.place_name}</strong>
                <span>
                  ภายใน {task.radius_km} กม. · หมดเวลา{" "}
                  {new Date(task.expires_at).toLocaleString("th-TH", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Bangkok",
                  })}
                </span>
                <Link
                  href={`/?mission=${encodeURIComponent(task.id)}&lat=${task.lat}&lon=${task.lon}`}
                  onClick={(event) => {
                    if (Date.now() >= Date.parse(task.expires_at)) {
                      event.preventDefault();
                      setNow(Date.now());
                      tasks.refresh();
                    }
                  }}
                >
                  ดูพื้นที่บนแผนที่
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
