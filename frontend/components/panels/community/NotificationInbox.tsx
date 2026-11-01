"use client";
import Link from "next/link";
import { useState } from "react";
import { useCurrentUserId } from "@/frontend/components/auth/AuthProvider";
import { useAccountData } from "@/frontend/hooks/useAccountData";
import { api } from "@/frontend/lib/api-client";
import type { NotificationsResponse } from "@/frontend/types";
export default function NotificationInbox() {
  const owner = useCurrentUserId();
  const query = useAccountData<NotificationsResponse>(
    owner,
    "notifications",
    api.notifications,
  );
  const [error, setError] = useState("");
  const items = query.data?.notifications ?? [];
  const unread = items.filter((item) => !item.read_at).length;
  const read = (id?: string) => {
    setError("");
    void (id ? api.markNotificationRead(id) : api.markAllNotificationsRead())
      .then(() =>
        query.setData((previous) =>
          previous
            ? {
                ...previous,
                unread_count: id ? Math.max(0, previous.unread_count - 1) : 0,
                notifications: previous.notifications.map((item) =>
                  !id || item.id === id
                    ? {
                        ...item,
                        read_at: item.read_at ?? new Date().toISOString(),
                      }
                    : item,
                ),
              }
            : previous,
        ),
      )
      .catch(() => setError("บันทึกสถานะการอ่านไม่สำเร็จ กรุณาลองอีกครั้ง"));
  };
  if (!owner) return null;
  return (
    <section className="cp-notifications-mobile" aria-label="กล่องแจ้งเตือน">
      <header>
        <h2>การแจ้งเตือน {unread > 0 && <span>{unread}</span>}</h2>
        {unread > 0 && (
          <button type="button" className="cp-focus" onClick={() => read()}>
            อ่านทั้งหมด
          </button>
        )}
      </header>
      {query.loading && !query.data ? (
        <p role="status" className="cp-news-empty">
          กำลังโหลดการแจ้งเตือน…
        </p>
      ) : query.error && !query.data ? (
        <div role="alert" className="cp-news-empty">
          <p>โหลดการแจ้งเตือนไม่สำเร็จ</p>
          <button
            type="button"
            className="cp-focus"
            onClick={() => query.refresh()}
          >
            ลองใหม่
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="cp-news-empty">
          ยังไม่มีการแจ้งเตือนใหม่
          <br />
          <small>สถานะรายงานและคำขอค่าฝุ่นจะแสดงที่นี่</small>
        </p>
      ) : (
        <ul>
          {items.slice(0, 10).map((item) => (
            <li key={item.id}>
              <Link
                href={item.url}
                className="cp-focus"
                data-unread={!item.read_at}
                onClick={() => {
                  if (!item.read_at) read(item.id);
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString("th-TH", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
