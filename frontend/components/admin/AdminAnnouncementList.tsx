"use client";

import { useMemo, useState } from "react";

import type { Announcement } from "@/frontend/types";

const STATUS_LABELS: Record<Announcement["status"], string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  archived: "เก็บแล้ว",
  expired: "หมดอายุ",
};

interface AdminAnnouncementListProps {
  announcements: Announcement[];
  busyId: string | null;
  onEdit: (announcement: Announcement) => void;
  onStatusChange: (
    announcement: Announcement,
    status: "draft" | "published" | "archived",
  ) => Promise<void>;
}

export default function AdminAnnouncementList({
  announcements,
  busyId,
  onEdit,
  onStatusChange,
}: AdminAnnouncementListProps) {
  const [query, setQuery] = useState("");
  const visibleAnnouncements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return announcements;
    return announcements.filter((item) =>
      [item.title, item.body, item.area, STATUS_LABELS[item.status]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [announcements, query]);
  return (
    <section className="cp-admin-form-card cp-admin-announcement-list">
      <div className="cp-admin-form-card__heading">
        <span className="cp-admin-form-icon">รายการ</span>
        <div>
          <h3>ประกาศทั้งหมด</h3>
          <p>เก็บเป็นฉบับร่าง เผยแพร่ หรือ archive โดยไม่ลบ audit record</p>
        </div>
      </div>
      {announcements.length === 0 && (
        <div className="cp-admin-empty cp-admin-empty--compact">
          ยังไม่มีประกาศในระบบ
        </div>
      )}
      {announcements.length > 0 && (
        <label className="cp-admin-audit-search">
          ค้นหาประกาศ
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="หัวข้อ พื้นที่ หรือสถานะ"
          />
        </label>
      )}
      {visibleAnnouncements.map((item) => (
        <div key={item.id} className="cp-admin-announcement-row">
          <div>
            <strong>{item.title}</strong>
            <div className="cp-admin-announcement-meta">
              {STATUS_LABELS[item.status]} · {item.area ?? "ทั่วประเทศ"}
            </div>
          </div>
          <div className="cp-admin-announcement-actions">
            {item.status !== "archived" && (
              <button
                type="button"
                disabled={busyId === item.id}
                className="cp-admin-button cp-admin-button--secondary cp-focus"
                onClick={() => onEdit(item)}
              >
                แก้ไข
              </button>
            )}
            {item.status !== "published" && item.status !== "archived" && (
              <button
                type="button"
                disabled={busyId === item.id}
                className="cp-admin-button cp-focus"
                onClick={() => void onStatusChange(item, "published")}
              >
                เผยแพร่
              </button>
            )}
            {item.status === "published" && (
              <button
                type="button"
                disabled={busyId === item.id}
                className="cp-admin-button cp-admin-button--secondary cp-focus"
                onClick={() => void onStatusChange(item, "draft")}
              >
                ยกเลิกเผยแพร่
              </button>
            )}
            {item.status !== "archived" && (
              <button
                type="button"
                disabled={busyId === item.id}
                className="cp-admin-button cp-admin-button--secondary cp-focus"
                onClick={() => void onStatusChange(item, "archived")}
              >
                เก็บออกจากรายการ
              </button>
            )}
          </div>
        </div>
      ))}
      {announcements.length > 0 && !visibleAnnouncements.length && (
        <div className="cp-admin-empty">ไม่พบประกาศที่ค้นหา</div>
      )}
    </section>
  );
}
