"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";

import type { DashboardTab, SheetSnap } from "@/frontend/types/ui";

const TABS: Array<{
  id: DashboardTab;
  href: string;
  label: string;
  description: string;
  icon: AppIconName;
}> = [
  {
    id: "map",
    href: "/",
    label: "แผนที่",
    description: "ดูค่าฝุ่นใกล้คุณ",
    icon: "map",
  },
  {
    id: "overview",
    href: "/air",
    label: "วันนี้",
    description: "ค่าฝุ่นและคำแนะนำ",
    icon: "home",
  },
  {
    id: "report",
    href: "/report",
    label: "ส่งรายงาน",
    description: "ถ่ายภาพเครื่องวัด",
    icon: "report",
  },
  {
    id: "community",
    href: "/community",
    label: "ข่าวสาร",
    description: "ประกาศและการแจ้งเตือน",
    icon: "megaphone",
  },
];

const scrollPositionByTab: Partial<Record<DashboardTab, number>> = {};

interface DashboardSidebarProps {
  tab: DashboardTab;
  snap: SheetSnap;
  header: ReactNode;
  children: ReactNode;
  onSnapChange: (snap: SheetSnap) => void;
  showAdmin: boolean;
}

function nextSnap(snap: SheetSnap): SheetSnap {
  if (snap === "peek") return "half";
  if (snap === "half") return "full";
  return "peek";
}

export default function DashboardSidebar({
  tab,
  snap,
  header,
  children,
  onSnapChange,
  showAdmin,
}: DashboardSidebarProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const savedPosition = scrollPositionByTab[tab] ?? 0;
    const restore = () => {
      if (body.scrollTop < savedPosition)
        body.scrollTo({ top: savedPosition, behavior: "instant" });
    };
    const frame = window.requestAnimationFrame(restore);
    const delayedRestore = window.setTimeout(restore, 150);
    const observer = new ResizeObserver(restore);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayedRestore);
      observer.disconnect();
      if (body.scrollTop > 0) scrollPositionByTab[tab] = body.scrollTop;
    };
  }, [tab]);

  return (
    <>
      <aside className="cp-aside">
        <button
          type="button"
          onClick={() => onSnapChange(nextSnap(snap))}
          aria-label="ปรับขนาดแผงข้อมูล"
          className="cp-grabber cp-focus"
        >
          <span />
        </button>
        <div className="cp-header">{header}</div>
        <div
          ref={bodyRef}
          className="cp-aside__body cp-scroll"
          onScroll={(event) => {
            if (event.currentTarget.getClientRects().length > 0)
              scrollPositionByTab[tab] = event.currentTarget.scrollTop;
          }}
        >
          {children}
        </div>
      </aside>

      <nav
        className="cp-mobile-nav"
        aria-label="เมนูหลักบนมือถือ"
        data-has-admin={showAdmin}
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              data-active={selected}
              data-tab={item.id}
              className="cp-focus"
            >
              <AppIcon name={item.icon} size={21} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
