import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Announcement } from "@/frontend/types";
import AnnouncementsSection from "./AnnouncementsSection";

afterEach(cleanup);

const items: Announcement[] = Array.from({ length: 12 }, (_, i) => ({
  id: `news-${i}`,
  title: `ข่าวฝุ่น ${i}`,
  body: "เปิดอ่านต้นฉบับ",
  kind: "news",
  area: null,
  published_at: "2026-11-07T03:00:00Z",
  expires_at: null,
  status: "published",
  image_url: null,
  source_name: "สำนักข่าวทดสอบ",
  source_url: `https://example.com/${i}`,
  external: true,
  created_at: null,
  updated_at: null,
}));

describe("news metadata pagination", () => {
  it("shows ten cards first and reveals the next page on demand", () => {
    render(<AnnouncementsSection announcements={items} />);
    expect(screen.getAllByRole("article")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "ดูข่าวเพิ่มเติม" }));
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe(
      "https://example.com/0",
    );
  });

  it("requests more stored metadata and disables duplicate requests while loading", () => {
    const load = vi.fn();
    const { rerender } = render(
      <AnnouncementsSection
        announcements={items.slice(0, 10)}
        hasMore
        onLoadMore={load}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ดูข่าวเพิ่มเติม" }));
    expect(load).toHaveBeenCalledOnce();
    rerender(
      <AnnouncementsSection
        announcements={items.slice(0, 10)}
        hasMore
        loadingMore
        onLoadMore={load}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "กำลังโหลด…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

it("keeps the article headline and meaningful summary without repeating the source boilerplate", () => {
  const { rerender } = render(
    <AnnouncementsSection
      announcements={[
        {
          ...items[0],
          title: "ฝุ่นวันนี้ - สำนักข่าวทดสอบ",
          body: "เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ",
        },
      ]}
    />,
  );
  expect(screen.getByRole("heading", { name: "ฝุ่นวันนี้" })).toBeTruthy();
  expect(
    screen.queryByText("เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ"),
  ).toBeNull();
  expect(
    screen
      .getByRole("link", { name: /อ่านจาก สำนักข่าวทดสอบ/ })
      .getAttribute("rel"),
  ).toContain("noopener");
  rerender(
    <AnnouncementsSection
      announcements={[
        { ...items[0], body: "คำแนะนำหลีกเลี่ยงกิจกรรมกลางแจ้ง" },
      ]}
    />,
  );
  expect(screen.getByText("คำแนะนำหลีกเลี่ยงกิจกรรมกลางแจ้ง")).toBeTruthy();
});
