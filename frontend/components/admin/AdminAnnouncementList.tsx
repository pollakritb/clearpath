"use client";

import { useMemo, useState } from "react";
import type { Announcement } from "@/frontend/types";
const STATUS_LABELS: Record<Announcement["status"], string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  archived: "เก็บแล้ว",
  expired: "หมดอายุ",
};
export default function AdminAnnouncementList({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return announcements.filter((item) =>
      [item.title, item.body, item.area, STATUS_LABELS[item.status]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [announcements, query]);
  return (
    <section className="cp-admin-form-card cp-admin-announcement-list">
      <h3>ประกาศทั้งหมด</h3>
      <label className="cp-admin-audit-search">
        ค้นหาประกาศ
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="หัวข้อ พื้นที่ หรือสถานะ"
        />
      </label>
      {visible.map((item) => (
        <article key={item.id} className="cp-admin-announcement-row">
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            <small>
              {STATUS_LABELS[item.status]} · {item.area ?? "ทั่วประเทศ"}
            </small>
          </div>
        </article>
      ))}
      {!visible.length && (
        <p className="cp-admin-empty">
          {announcements.length
            ? "ไม่พบประกาศที่ค้นหา"
            : "ยังไม่มีประกาศในระบบ"}
        </p>
      )}
    </section>
  );
}
