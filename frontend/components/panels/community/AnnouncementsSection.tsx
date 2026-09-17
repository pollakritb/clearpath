import Image from "next/image";

import AppIcon from "@/frontend/components/ui/AppIcon";
import type { Announcement } from "@/frontend/types";

const KIND_LABEL = {
  alert: "สำคัญ",
  news: "ข่าว",
  community: "ชุมชน",
} as const;

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}

export default function AnnouncementsSection({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const visible = announcements.slice(0, 6);

  return (
    <section
      className="cp-community-announcements"
      aria-labelledby="community-announcements-title"
    >
      <header className="cp-community-announcements__heading">
        <span aria-hidden="true">
          <AppIcon name="alert" size={21} />
        </span>
        <span>
          <small>ประกาศ ClearPath และข่าวคุณภาพอากาศ</small>
          <h2 id="community-announcements-title">ข่าวสารล่าสุด</h2>
        </span>
        {visible.length > 0 && <b>{visible.length}</b>}
      </header>

      {visible.length === 0 ? (
        <div className="cp-community-announcements__empty">
          <span aria-hidden="true">
            <AppIcon name="check" size={20} />
          </span>
          <span>
            <strong>ยังไม่มีประกาศใหม่</strong>
            <small>เมื่อมีข่าวสำคัญในพื้นที่ จะแสดงที่นี่ก่อน</small>
          </span>
        </div>
      ) : (
        <div className="cp-community-announcements__list">
          {visible.map((item) => (
            <article key={item.id} data-kind={item.kind}>
              {item.image_url && (
                <Image
                  unoptimized
                  src={item.image_url}
                  alt="ภาพประกอบประกาศ"
                  width={800}
                  height={450}
                />
              )}
              <div className="cp-community-announcements__meta">
                <b>{KIND_LABEL[item.kind]}</b>
                {item.area && <span>{item.area}</span>}
                <time dateTime={item.published_at}>
                  {formatPublishedAt(item.published_at)}
                </time>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {item.external && item.source_url && (
                <a
                  className="cp-community-announcements__source"
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  อ่านจาก {item.source_name ?? "สำนักข่าวต้นฉบับ"}
                  <AppIcon name="chevron" size={16} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
