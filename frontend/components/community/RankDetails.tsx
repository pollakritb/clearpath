"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ParticipationRank } from "@/frontend/types/xp";
import ParticipationBadge from "./ParticipationBadge";

const LEVELS = [
  ["explorer", "นักสำรวจอากาศ", 0],
  ["reporter", "ผู้รายงานชุมชน", 100],
  ["caretaker", "ผู้ร่วมดูแลอากาศ", 500],
  ["guardian", "ผู้พิทักษ์อากาศ", 1500],
  ["champion", "แกนนำอากาศสะอาด", 5000],
] as const;

export default function RankDetails({
  rank,
  xp,
  active,
}: {
  rank: ParticipationRank;
  xp: number;
  active: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!active) dialogRef.current?.close();
  }, [active]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cp-xp-rank-trigger"
        aria-label={`ดูระดับปัจจุบัน: ${rank.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <ParticipationBadge rank={rank} />
        <span aria-hidden="true">›</span>
      </button>
      <dialog
        ref={dialogRef}
        className="cp-xp-rank-dialog"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          if (active) triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="cp-xp-rank-content">
          <header>
            <h2 id={titleId}>ระดับและยศของคุณ</h2>
            <button
              type="button"
              aria-label="ปิดรายละเอียดระดับ"
              onClick={() => dialogRef.current?.close()}
              autoFocus
            >
              ✕
            </button>
          </header>
          <p>ยศปัจจุบัน: {rank.label}</p>
          <p>
            <strong>{xp.toLocaleString()} XP สะสม</strong>
          </p>
          <p className="cp-xp-note">
            เลื่อนยศตาม XP สะสมตลอดชีพ ไม่กำหนดจำนวนวัน
          </p>
          <ol className="cp-xp-rank-levels" aria-label="ยศทั้ง 5 ระดับ">
            {LEVELS.map(([code, label, minimum], index) => (
              <li
                key={code}
                aria-current={code === rank.code ? "step" : undefined}
              >
                <div>
                  <span className="cp-xp-note">ระดับ {index + 1}</span>
                  <ParticipationBadge
                    rank={{ ...rank, code, label, minimum_xp: minimum }}
                  />
                  <span>{minimum.toLocaleString()} XP</span>
                </div>
                {code === rank.code && <strong>ปัจจุบัน</strong>}
              </li>
            ))}
          </ol>
          <p className="cp-xp-note">
            {rank.next_xp !== null
              ? `อีก ${Math.max(0, rank.next_xp - xp).toLocaleString()} XP ถึงยศ${rank.next_label}`
              : "คุณได้รับยศสูงสุดแล้ว"}
          </p>
        </div>
      </dialog>
    </>
  );
}
