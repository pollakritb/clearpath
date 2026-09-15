"use client";

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
        loading: news.loading,
        error: news.error,
        onRefresh: news.refresh,
        showDataStatus: false,
        showAuth: false,
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
      {!news.error && news.loading && !news.announcements.length ? (
        <div className="cp-page-feedback" role="status">
          กำลังโหลดข่าวสารล่าสุด…
        </div>
      ) : (
        <CommunityPanel announcements={news.announcements} />
      )}
    </UserPageShell>
  );
}
