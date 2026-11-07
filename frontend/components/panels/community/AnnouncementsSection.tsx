"use client";
import { useState } from "react";
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
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnnouncementsSection({
  announcements,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  announcements: Announcement[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "announcements" | "news">("all");
  const [limit, setLimit] = useState(10);
  const filtered = announcements.filter(
    (item) =>
      filter === "all" || (filter === "news" ? item.external : !item.external),
  );
  const visible = filtered.slice(0, limit);

  return (
    <section
      className="cp-community-announcements"
      aria-labelledby="community-announcements-title"
    >
      <div className="cp-news-filters" role="group" aria-label="ประเภทข่าว">
        {(
          [
            ["all", "ทั้งหมด"],
            ["announcements", "ประกาศ"],
            ["news", "ข่าว"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="cp-focus"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setLimit(10);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <h2 id="community-announcements-title" className="cp-news-list-title">
        ข่าวสารล่าสุด <span>{filtered.length}</span>
      </h2>

      {visible.length === 0 ? (
        <div className="cp-community-announcements__empty">
          <span aria-hidden="true">
            <AppIcon name="check" size={20} />
          </span>
          <span>
            <strong>ยังไม่มีข่าวในรายการนี้</strong>
            <small>ดูข่าวเพิ่มเติมหรือเลือกหมวดทั้งหมด</small>
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
      {(filtered.length > limit || hasMore) && (
        <button
          type="button"
          className="cp-news-more cp-focus"
          disabled={loadingMore}
          onClick={() => {
            if (filtered.length <= limit && hasMore) onLoadMore?.();
            setLimit((value) => value + 10);
          }}
        >
          {loadingMore ? "กำลังโหลด…" : "ดูข่าวเพิ่มเติม"}
        </button>
      )}
    </section>
  );
}
