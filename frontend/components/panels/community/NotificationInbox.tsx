"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api } from "@/frontend/lib/api-client";
import { T } from "@/frontend/lib/ui";
import type { UserNotification } from "@/frontend/types";

export default function NotificationInbox() {
  const auth = useAuth();
  const [items, setItems] = useState<UserNotification[]>([]);

  useEffect(() => {
    if (!auth.user && !auth.localDemo) return;
    let cancelled = false;
    const load = () =>
      void api
        .notifications()
        .then((result) => {
          if (!cancelled) setItems(result.notifications);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.user, auth.localDemo]);

  if ((!auth.user && !auth.localDemo) || items.length === 0) return null;
  const unread = items.filter((item) => !item.read_at).length;
  return (
    <section style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: ".95em" }}>
          กล่องแจ้งเตือน {unread ? `(${unread})` : ""}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            className="cp-focus"
            onClick={() =>
              void api.markAllNotificationsRead().then(() =>
                setItems((current) =>
                  current.map((item) => ({
                    ...item,
                    read_at: item.read_at ?? new Date().toISOString(),
                  })),
                ),
              )
            }
          >
            อ่านทั้งหมด
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: ".45em", marginTop: ".55em" }}>
        {items.slice(0, 10).map((item) => (
          <Link
            key={item.id}
            href={item.url}
            onClick={() => {
              if (!item.read_at) {
                void api.markNotificationRead(item.id);
                setItems((current) =>
                  current.map((row) =>
                    row.id === item.id
                      ? { ...row, read_at: new Date().toISOString() }
                      : row,
                  ),
                );
              }
            }}
            className="cp-focus"
            style={{
              display: "block",
              border: `1px solid ${T.line}`,
              borderRadius: "9px",
              padding: ".6em",
              color: T.ink,
              textDecoration: "none",
              background: item.read_at ? "transparent" : T.chip,
            }}
          >
            <strong style={{ fontSize: ".76em" }}>{item.title}</strong>
            <div style={{ fontSize: ".68em", color: T.subInk }}>
              {item.body}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
