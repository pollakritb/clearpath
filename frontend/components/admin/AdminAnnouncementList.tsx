import type { Announcement } from "@/frontend/types";

interface AdminAnnouncementListProps {
  announcements: Announcement[];
  onPublish: (announcementId: string) => Promise<void>;
  onArchive: (announcementId: string) => Promise<void>;
}

export default function AdminAnnouncementList({
  announcements,
  onPublish,
  onArchive,
}: AdminAnnouncementListProps) {
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
      {announcements.map((item) => (
        <div key={item.id} className="cp-admin-announcement-row">
          <div>
            <strong>{item.title}</strong>
            <div className="cp-admin-announcement-meta">
              {item.status} · {item.area ?? "นครปฐม"}
            </div>
          </div>
          <div className="cp-admin-announcement-actions">
            {item.status !== "published" && item.status !== "archived" && (
              <button
                type="button"
                className="cp-admin-button cp-focus"
                onClick={() => void onPublish(item.id)}
              >
                เผยแพร่
              </button>
            )}
            {item.status !== "archived" && (
              <button
                type="button"
                className="cp-admin-button cp-admin-button--secondary cp-focus"
                onClick={() => void onArchive(item.id)}
              >
                Archive
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
