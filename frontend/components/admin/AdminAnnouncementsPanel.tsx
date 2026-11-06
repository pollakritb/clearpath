"use client";

import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { Announcement } from "@/frontend/types";
import AdminAnnouncementList from "./AdminAnnouncementList";

export default function AdminAnnouncementsPanel({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void api
      .adminAnnouncements()
      .then((result) => {
        if (active) setAnnouncements(result.announcements);
      })
      .catch((cause) => {
        if (active) setError(apiErrorMessage(cause, "โหลดประกาศไม่สำเร็จ"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);
  if (!isAdmin)
    return (
      <p className="cp-admin-empty">เฉพาะ Admin ที่มีสิทธิ์ดูประวัติประกาศ</p>
    );
  return (
    <section>
      <div className="cp-admin-section-heading">
        <div>
          <h2>ประวัติประกาศ</h2>
          <p>ดูเนื้อหา พื้นที่ และสถานะของประกาศที่มีอยู่ในระบบ</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">กำลังโหลดประกาศ…</p>
      ) : (
        <AdminAnnouncementList announcements={announcements} />
      )}
    </section>
  );
}
