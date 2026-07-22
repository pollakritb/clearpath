"use client";

import { useEffect, useState } from "react";

import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { Announcement } from "@/frontend/types";

import AdminAnnouncementList from "./AdminAnnouncementList";

function isoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function AdminPublishingPanel({
  isAdmin,
  onPublished,
}: {
  isAdmin: boolean;
  onPublished: () => void;
}) {
  const [announcement, setAnnouncement] = useState({
    title: "",
    body: "",
    kind: "community" as "news" | "alert" | "community",
    area: "นครปฐม",
    expiresAt: "",
    status: "published" as "draft" | "published",
  });
  const [announcementImage, setAnnouncementImage] = useState<File | null>(null);
  const [existingAnnouncements, setExistingAnnouncements] = useState<
    Announcement[]
  >([]);
  const [activity, setActivity] = useState({
    title: "",
    description: "",
    rewardPoints: 10,
    startsAt: "",
    endsAt: "",
  });
  const [saving, setSaving] = useState<"announcement" | "activity" | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAnnouncements() {
    try {
      const result = await api.adminAnnouncements();
      setExistingAnnouncements(result.announcements);
    } catch (cause) {
      setError(apiErrorMessage(cause, "โหลดรายการประกาศไม่สำเร็จ"));
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void api
      .adminAnnouncements()
      .then((result) => {
        if (!cancelled) setExistingAnnouncements(result.announcements);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <section className="cp-admin-locked">
        <span>เฉพาะ Admin</span>
        <h2>คุณไม่มีสิทธิ์เผยแพร่เนื้อหา</h2>
        <p>
          Moderator สามารถตรวจรายงานได้ แต่การสร้างประกาศและกิจกรรมต้องใช้บทบาท
          Admin
        </p>
      </section>
    );
  }

  async function submitAnnouncement(event: React.FormEvent) {
    event.preventDefault();
    setSaving("announcement");
    setError(null);
    setMessage(null);
    try {
      const uploaded = announcementImage
        ? await api.uploadAnnouncementImage(announcementImage)
        : null;
      await api.createAnnouncement({
        title: announcement.title.trim(),
        body: announcement.body.trim(),
        kind: announcement.kind,
        area: announcement.area.trim() || null,
        expires_at: isoOrNull(announcement.expiresAt),
        status: announcement.status,
        image_path: uploaded?.path ?? null,
      });
      setAnnouncement((current) => ({
        ...current,
        title: "",
        body: "",
        expiresAt: "",
      }));
      setAnnouncementImage(null);
      setMessage(
        announcement.status === "draft"
          ? "บันทึกฉบับร่างแล้ว"
          : "เผยแพร่ประกาศแล้ว",
      );
      await loadAnnouncements();
      onPublished();
    } catch (cause) {
      setError(apiErrorMessage(cause, "เผยแพร่ประกาศไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  async function submitActivity(event: React.FormEvent) {
    event.preventDefault();
    setSaving("activity");
    setError(null);
    setMessage(null);
    try {
      await api.createActivity({
        title: activity.title.trim(),
        description: activity.description.trim(),
        reward_points: activity.rewardPoints,
        starts_at: isoOrNull(activity.startsAt),
        ends_at: isoOrNull(activity.endsAt),
      });
      setActivity((current) => ({
        ...current,
        title: "",
        description: "",
        startsAt: "",
        endsAt: "",
      }));
      setMessage("สร้างกิจกรรมแล้ว");
      onPublished();
    } catch (cause) {
      setError(apiErrorMessage(cause, "สร้างกิจกรรมไม่สำเร็จ"));
    } finally {
      setSaving(null);
    }
  }

  async function publishAnnouncement(announcementId: string) {
    setError(null);
    try {
      await api.updateAnnouncement(announcementId, { status: "published" });
      await loadAnnouncements();
    } catch (cause) {
      setError(apiErrorMessage(cause, "เผยแพร่ประกาศไม่สำเร็จ"));
    }
  }

  async function archiveAnnouncement(announcementId: string) {
    setError(null);
    try {
      await api.archiveAnnouncement(announcementId);
      await loadAnnouncements();
    } catch (cause) {
      setError(apiErrorMessage(cause, "Archive ประกาศไม่สำเร็จ"));
    }
  }

  return (
    <section>
      <div className="cp-admin-section-heading">
        <div>
          <span className="cp-eyebrow">Community content</span>
          <h2>ประกาศและกิจกรรม</h2>
          <p>จัดการข้อมูลที่จะแสดงในพื้นที่ชุมชนของผู้ใช้งาน</p>
        </div>
      </div>

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className="cp-admin-feedback"
          data-error={Boolean(error)}
        >
          {error ?? message}
        </div>
      )}

      <div className="cp-admin-form-grid">
        <form className="cp-admin-form-card" onSubmit={submitAnnouncement}>
          <div className="cp-admin-form-card__heading">
            <span className="cp-admin-form-icon">ประกาศ</span>
            <div>
              <h3>สร้างประกาศชุมชน</h3>
              <p>ข่าวสาร เหตุเฝ้าระวัง หรือข้อมูลสำคัญในพื้นที่</p>
            </div>
          </div>
          <label>
            หัวข้อประกาศ
            <input
              required
              value={announcement.title}
              onChange={(event) =>
                setAnnouncement((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="เช่น เฝ้าระวังค่าฝุ่นสูงช่วงเย็น"
            />
          </label>
          <label>
            รายละเอียด
            <textarea
              required
              rows={5}
              value={announcement.body}
              onChange={(event) =>
                setAnnouncement((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </label>
          <div className="cp-admin-fields-row">
            <label>
              ประเภท
              <select
                value={announcement.kind}
                onChange={(event) =>
                  setAnnouncement((current) => ({
                    ...current,
                    kind: event.target.value as typeof current.kind,
                  }))
                }
              >
                <option value="community">ชุมชน</option>
                <option value="news">ข่าวสาร</option>
                <option value="alert">แจ้งเตือน</option>
              </select>
            </label>
            <label>
              พื้นที่
              <input
                value={announcement.area}
                onChange={(event) =>
                  setAnnouncement((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              สถานะ
              <select
                value={announcement.status}
                onChange={(event) =>
                  setAnnouncement((current) => ({
                    ...current,
                    status: event.target.value as typeof current.status,
                  }))
                }
              >
                <option value="published">เผยแพร่ทันที</option>
                <option value="draft">ฉบับร่าง</option>
              </select>
            </label>
          </div>
          <label>
            ภาพประกอบ (ไม่บังคับ, สูงสุด 5 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setAnnouncementImage(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <label>
            หมดอายุ (ไม่บังคับ)
            <input
              type="datetime-local"
              value={announcement.expiresAt}
              onChange={(event) =>
                setAnnouncement((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="submit"
            disabled={saving !== null}
            className="cp-admin-button cp-focus"
          >
            {saving === "announcement" ? "กำลังเผยแพร่…" : "เผยแพร่ประกาศ"}
          </button>
        </form>

        <form className="cp-admin-form-card" onSubmit={submitActivity}>
          <div className="cp-admin-form-card__heading">
            <span className="cp-admin-form-icon" data-activity>
              กิจกรรม
            </span>
            <div>
              <h3>สร้างกิจกรรมสะสมคะแนน</h3>
              <p>ชวนผู้ใช้ส่งรายงานหรือช่วยตรวจสอบข้อมูล</p>
            </div>
          </div>
          <label>
            ชื่อกิจกรรม
            <input
              required
              value={activity.title}
              onChange={(event) =>
                setActivity((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="เช่น ภารกิจสำรวจฝุ่นประจำสัปดาห์"
            />
          </label>
          <label>
            รายละเอียด
            <textarea
              required
              rows={5}
              value={activity.description}
              onChange={(event) =>
                setActivity((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label>
            คะแนนรางวัล
            <input
              type="number"
              min="0"
              max="10000"
              value={activity.rewardPoints}
              onChange={(event) =>
                setActivity((current) => ({
                  ...current,
                  rewardPoints: Number(event.target.value),
                }))
              }
            />
          </label>
          <div className="cp-admin-fields-row">
            <label>
              เริ่มต้น
              <input
                type="datetime-local"
                value={activity.startsAt}
                onChange={(event) =>
                  setActivity((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              สิ้นสุด
              <input
                type="datetime-local"
                value={activity.endsAt}
                onChange={(event) =>
                  setActivity((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving !== null}
            className="cp-admin-button cp-focus"
          >
            {saving === "activity" ? "กำลังสร้าง…" : "สร้างกิจกรรม"}
          </button>
        </form>
      </div>

      <AdminAnnouncementList
        announcements={existingAnnouncements}
        onPublish={publishAnnouncement}
        onArchive={archiveAnnouncement}
      />
    </section>
  );
}
