"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import AppIcon, { type AppIconName } from "@/frontend/components/ui/AppIcon";

import type { DashboardTab, SheetSnap } from "./dashboard-types";

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
    description: "ค่าฝุ่นและพยากรณ์",
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
    label: "ชุมชน",
    description: "ข่าวสารและคำขอบคุณ",
    icon: "community",
  },
];

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
    bodyRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <>
      <nav className="cp-primary-nav" aria-label="เมนูหลักของผู้ใช้งาน">
        <Link
          href="/"
          className="cp-brand cp-focus"
          aria-label="ClearPath หน้าแผนที่"
        >
          <span className="cp-brand__mark" aria-hidden>
            C
          </span>
          <span className="cp-brand__copy">
            <strong>ClearPath</strong>
            <small>ประเทศไทย</small>
          </span>
        </Link>

        <div className="cp-primary-nav__label">พื้นที่ผู้ใช้งาน</div>
        <div className="cp-primary-nav__items">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className="cp-nav-item cp-focus"
                data-active={selected}
                data-tab={item.id}
              >
                <span className="cp-nav-item__icon">
                  <AppIcon name={item.icon} size={21} />
                </span>
                <span className="cp-nav-item__copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="cp-primary-nav__footer">
          <div className="cp-source-card">
            <span className="cp-source-card__icon">
              <AppIcon name="database" size={18} />
            </span>
            <span>
              <strong>ข้อมูลหลัก Air4Thai</strong>
              <small>เสริมด้วยข้อมูลชุมชนที่ผ่านการตรวจ</small>
            </span>
          </div>
          {showAdmin && (
            <Link href="/admin" className="cp-admin-entry cp-focus">
              <AppIcon name="admin" size={19} />
              <span>เข้าสู่ระบบผู้ดูแล</span>
              <AppIcon name="chevron" size={16} />
            </Link>
          )}
        </div>
      </nav>

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
        <div ref={bodyRef} className="cp-aside__body cp-scroll">
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
