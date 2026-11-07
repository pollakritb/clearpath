"use client";

import styles from "./NewsPageClient.module.css";

import UserPageShell from "@/frontend/components/app/UserPageShell";
import CommunityPanel from "@/frontend/components/panels/CommunityPanel";
import { useAnnouncements } from "@/frontend/hooks/useCommunity";

export default function NewsPageClient() {
  const news = useAnnouncements();

  return (
    <UserPageShell
      tab="community"
      icon="megaphone"
      header={{
        title: "ข่าวสาร",
        description: "ข่าวคุณภาพอากาศและการแจ้งเตือนของคุณ",
        loading: news.loading,
        error: news.error,
        onRefresh: news.refresh,
        showDataStatus: false,
      }}
    >
      {news.error && (
        <div className="cp-page-feedback" role="alert" data-state="error">
          <strong>โหลดข่าวสารไม่สำเร็จ</strong>
          <span>{news.error}</span>
          <button type="button" className="cp-focus" onClick={news.refresh}>
            ลองอีกครั้ง
          </button>
        </div>
      )}
      {(news.checkedAt ||
        ["pending", "failed", "stale"].includes(news.syncStatus)) && (
        <p className={styles.sync} role="status">
          {news.checkedAt
            ? `ตรวจข่าวล่าสุด ${new Date(news.checkedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} น.`
            : news.syncStatus === "pending"
              ? "กำลังรอการรวบรวมข่าวรอบแรก"
              : ""}
          {news.syncStatus === "failed" || news.syncStatus === "stale"
            ? " · ยังซิงก์รอบใหม่ไม่สำเร็จ แสดงข่าวที่จัดเก็บไว้"
            : ""}
        </p>
      )}
      {!news.error && news.loading && !news.announcements.length ? (
        <div className="cp-page-feedback" role="status">
          กำลังโหลดข่าวสารล่าสุด…
        </div>
      ) : (
        <CommunityPanel
          announcements={news.announcements}
          hasMore={news.hasMore}
          loadingMore={news.loadingMore}
          onLoadMore={news.loadMore}
        />
      )}
    </UserPageShell>
  );
}
